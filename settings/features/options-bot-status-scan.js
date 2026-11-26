// Bot Status pacing, durable resume queues, eligibility review, and scan execution.
async function noteBotStatusRunEvent(event, detail = {}) {
  try {
    // Diagnostics must never strand a scan if its background channel stalls.
    await runtimeMessageWithTimeout({ type: "DS_BOT_STATUS_RUN_EVENT", event, detail }, 5000);
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
    // A lost service-worker response used to leave the serial scan waiting
    // forever. Never continue without a confirmed pace interval: falling back
    // to a hidden Options timer may take minutes, or may issue checks too fast.
    const response = await runtimeMessageWithTimeout(
      { type: "DS_BOT_STATUS_PACE_WAIT", delayMs: waitMs }, waitMs + 6000);
    return !!response?.ok;
  } catch { return false; }
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

// Stale-refresh work has its own durable queue. A user can stop an ordinary
// scan, refresh stale results, and still resume the original pending IDs later.
const BOT_STATUS_STALE_PAUSED_QUEUE_KEY = "botStatusPausedStaleQueueV1";
function botStatusQueueKey(kind = "main") {
  return kind === "stale" ? BOT_STATUS_STALE_PAUSED_QUEUE_KEY : BOT_STATUS_PAUSED_QUEUE_KEY;
}
async function botStatusPausedQueue(kind = "main") {
  const key = botStatusQueueKey(kind);
  // A storage read failure is NOT an empty queue. Never start or overwrite a
  // durable scan when the authoritative pending IDs could not be read.
  const read = await storageGetChecked([key]);
  if (!read.ok) throw new Error(`Could not read ${kind} Bot Status resume queue; no scan was started.`);
  const value = read.data?.[key];
  return value && Array.isArray(value.ids) ? value : null;
}

let botStatusQueuedPairRead = null;
let botStatusScanNeedsReload = false;
async function botStatusPausedQueues() {
  // Coalesce overlapping read-only UI requests. Do not cache a completed read:
  // scans, resumes and reconciliation must always see authoritative storage.
  if (botStatusQueuedPairRead) return botStatusQueuedPairRead;
  const request = (async () => {
    const keys = [BOT_STATUS_PAUSED_QUEUE_KEY, BOT_STATUS_STALE_PAUSED_QUEUE_KEY];
    const read = await storageGetChecked(keys);
    if (!read.ok) throw new Error("Bot Status queue storage is temporarily unavailable; saved queue state was not changed.");
    const data = read.data;
    return keys.map(key => data?.[key] && Array.isArray(data[key].ids) ? data[key] : null);
  })();
  botStatusQueuedPairRead = request;
  try { return await request; }
  finally { if (botStatusQueuedPairRead === request) botStatusQueuedPairRead = null; }
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
  if (pending && report.saveVerified !== false) parts.push(`${pending} pending (Resume available)`);
  if (deferred) parts.push(`${deferred} deferred after network/auth problems`);
  if (unknown) parts.push(`${unknown} inconclusive`);
  if (changed) parts.push(`${changed} updated`);
  if (recovered) parts.push(`${recovered} recovered`);
  if (report.uniqueTargets != null && Number.isFinite(Number(report.uniqueTargets))) parts.push(`${Number(report.uniqueTargets)} unique targets`);
  if (report.duplicateQueueEntries != null) parts.push(`${Number(report.duplicateQueueEntries) || 0} duplicate queue checks skipped`);
  if (report.workerChecks != null) parts.push(`${Number(report.workerChecks)} helper checks`);
  if (report.retries != null) parts.push(`${Number(report.retries)} helper retries`);
  // Explicit bulk scans deliberately bypass the short ad-hoc result cache.
  // A measured zero here is expected, not a missing measurement.
  if (report.cacheHits != null) parts.push(`${Number(report.cacheHits)} worker cache hits (fresh scan)`);
  else parts.push('worker cache-hit count unavailable');
  if (report.coalesced != null) parts.push(`${Number(report.coalesced)} in-flight checks coalesced`);
  if (Number(report.accessFailures || 0)) parts.push(`${Number(report.accessFailures)} network/auth failures`);
  if (report.cancelled) parts.push("stopped by user");
  if (report.interrupted) parts.push("interrupted; pending checks retained for Resume");
  if (report.saveVerified === false) parts.push("Save verification failed — reopen Settings and check the previous durable checkpoint");
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

// Reconcile durable resume queues locally against the current saved sources.
// Ineligible IDs are HELD inside their original queue, not deleted or scanned.
// They automatically become pending again when the original scope allows them.
// No network checks, timers, new observers, or changes to saved bot records.
function botStatusHeldEntries(queue) {
  const seen = new Set();
  return (Array.isArray(queue?.heldIds) ? queue.heldIds : []).filter(item => {
    const id = String(item?.id || "").trim().toLowerCase();
    if (!validBotId(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map(item => ({
    id: String(item.id).trim().toLowerCase(),
    mode: String(item.mode || queue?.mode || "all"),
    scope: String(item.scope || queue?.scope || "all"),
    reason: String(item.reason || "No longer in the original scan scope").slice(0, 160),
    since: Number(item.since || 0) || Date.now()
  }));
}

function reviewBotStatusQueueEligibility(queue) {
  const ids = [...new Set((Array.isArray(queue?.ids) ? queue.ids : [])
    .map(id => String(id || "").trim().toLowerCase()).filter(validBotId))];
  const mode = String(queue?.mode || "all");
  const scope = String(queue?.scope || "all");
  const blockedIds = new Set(normalizeBotStore(blockedState).ids.map(id => String(id || "").toLowerCase()));
  const saved = botAvailabilityState.meta || {};
  const archives = botArchiveState.meta || {};
  const trackedInScope = collectTrackedAvailabilityBots(scope);
  const eligibleIds = mode === "outside"
    ? new Set(botStatusCenterBaseEntries("all")
      .filter(entry => !entry._scanEligible && !blockedIds.has(String(entry.id || "").toLowerCase()) && !botStatusIdIgnored(entry.id))
      .map(entry => entry.id))
    : mode === "archived"
      ? new Set(Object.values(saved).filter(entry => isConfirmedUnavailableBotStatus(entry) && archives[entry.id] && !blockedIds.has(String(entry.id || "").toLowerCase())).map(entry => entry.id))
      : new Set(trackedInScope.map(entry => entry.id));
  const elsewhere = new Set((scope === "all" ? trackedInScope : collectTrackedAvailabilityBots("all")).map(entry => entry.id));
  const unavailable = ids.filter(id => !eligibleIds.has(id)).map(id => {
    let reason;
    if (botStatusIdIgnored(id)) reason = "Forgotten / excluded from Bot Status";
    else if (mode === "outside" && blockedIds.has(id)) reason = "Blocked; excluded from outside-scope scans";
    else if (mode === "archived" && blockedIds.has(id)) reason = "Blocked; excluded from archived rechecks";
    else if (mode === "archived" && !archives[id]) reason = "No longer has an eligible saved recovery copy";
    else if (mode === "archived" && !isConfirmedUnavailableBotStatus(saved[id])) reason = "No longer confirmed unavailable";
    else if (mode === "outside" && elsewhere.has(id)) reason = "Now included in routine tracking";
    else if (scope !== "all" && elsewhere.has(id)) reason = `No longer in the original ${scope} scan scope`;
    else reason = "No longer in an eligible tracked source";
    return { id, reason };
  });
  return { ids, unavailable, mode, scope };
}

// Reassess every saved held entry against current local membership. Stored
// reason text is historical diagnostic information, never an authorization
// to scan. These decisions perform no network requests or destructive writes.
function botStatusAssessHeldEntries(items) {
  // No held entries means no need to rebuild a 6k+ bot tracking index.
  if (!Array.isArray(items) || !items.length) return [];
  const blockedIds = new Set(normalizeBotStore(blockedState).ids.map(id => String(id).toLowerCase()));
  const saved = botAvailabilityState.meta || {};
  const archives = botArchiveState.meta || {};
  const elsewhere = new Map(collectTrackedAvailabilityBots('all').map(entry => [entry.id, entry]));
  const groups = new Map();
  for (const item of items) {
    const key = `${item.mode}\u0000${item.scope}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const eligibility = new Map();
  for (const [key, group] of groups) {
    const { mode, scope } = group[0];
    const report = reviewBotStatusQueueEligibility({ mode, scope, ids: group.map(item => item.id) });
    const unavailable = new Map(report.unavailable.map(row => [row.id, row.reason]));
    for (const item of group) eligibility.set(`${key}\u0000${item.id}`, unavailable.get(item.id) || '');
  }
  return items.map(item => {
    const id = item.id;
    const originalReason = String(item.reason || '');
    const unavailability = eligibility.get(`${item.mode}\u0000${item.scope}\u0000${id}`) || '';
    const history = saved[id] || {};
    const currentlyTracked = elsewhere.get(id);
    const checkedAt = Number(history.checkedAt || 0);
    const checkedSinceHeld = Number(item.since || 0) > 0 && checkedAt > Number(item.since);
    const confirmed = ['available', 'unavailable', 'restricted'].includes(String(history.status || '')) &&
      Number(history.unavailableEvidenceCount || 0) !== 1;
    let category, reason, action;
    if (botStatusIdIgnored(id)) {
      category = 'excluded'; reason = 'Deliberately forgotten / excluded from Bot Status'; action = 'No recheck; excluded by user';
    } else if (blockedIds.has(id)) {
      category = 'excluded'; reason = 'Currently blocked; manual recovery must not bypass blocks'; action = 'No recheck while blocked';
    } else if (checkedSinceHeld && confirmed) {
      category = 'completed'; reason = `Confirmed ${history.status} after this hold was created`; action = 'Retire completed queue entry; history stays saved';
    } else if ((item.mode === 'unchecked' && checkedAt > 0 && confirmed) ||
      (item.mode === 'unknown' && checkedAt > 0 && confirmed)) {
      category = 'completed'; reason = `Original ${item.mode} check already resolved (${history.status})`; action = 'Retire obsolete queue entry; history stays saved';
    } else if (!unavailability) {
      category = 'eligible'; reason = 'Back in the original tracked scan scope'; action = 'Release to original resume queue';
    } else if (item.mode === 'archived') {
      category = 'excluded'; reason = unavailability; action = 'No archived recovery scan unless eligibility returns';
    } else if (checkedSinceHeld && history.status === 'unknown') {
      category = 'temporary'; reason = 'Most recent recheck was inconclusive; prior results are preserved'; action = 'Manual recheck available';
    } else if (currentlyTracked) {
      category = 'out-of-scope';
      reason = `No longer in original ${item.scope} source; currently found in ${(currentlyTracked.sources || []).join(', ') || 'another tracked source'}`;
      action = 'Manual recheck available';
    } else {
      category = 'recoverable';
      reason = 'No longer in an eligible tracked source; saved ID retained for manual recovery';
      action = 'Manual recheck available';
    }
    return { ...item, originalReason, category, reason, action,
      manualRetryAllowed: ['eligible', 'out-of-scope', 'recoverable', 'temporary'].includes(category),
      checkedAt, status: String(history.status || 'not checked'),
      sources: Array.isArray(currentlyTracked?.sources) ? currentlyTracked.sources : [],
      hasCopy: !!archives[id] };
  });
}

function botStatusManualHeldRetryAllowed(item, blockedIds) {
  // Called only with actual held queue entries, and always re-evaluated from
  // current saved sources. Never trust stale saved reason strings to authorize.
  return !!item && validBotId(item.id) && !botStatusIdIgnored(item.id) &&
    !blockedIds.has(item.id) && item.category !== 'excluded' && item.category !== 'completed' &&
    item.manualRetryAllowed === true;
}

function botStatusSavedHeldScanSources(raw) {
  const entries = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const normalized = {};
  for (const [key, kinds] of Object.entries(entries)) {
    const id = String(key).trim().toLowerCase();
    if (!validBotId(id) || !Array.isArray(kinds)) continue;
    const sources = [...new Set(kinds.filter(kind => kind === "main" || kind === "stale"))];
    if (sources.length) normalized[id] = sources;
  }
  return normalized;
}

function botStatusRecoveryEntry(id, availability, archives) {
  const previous = availability[id] || {};
  const archive = archives[id] || {};
  const fields = archive.fields || {};
  return {
    ...previous, id,
    name: cleanAuthoritativeBotName(previous.name || fields.name || archive.name || "", id) || id,
    creator: previous.creator || fields.creator || archive.creator || "",
    image: previous.image || fields.image || archive.image || "",
    profileUrl: previous.profileUrl || archive.profileUrl || `https://spicychat.ai/chatbot/${id}`,
    chatUrl: previous.chatUrl || `https://spicychat.ai/chat/${id}`,
    sources: uniqueClean([...(previous.sources || []), "saved-pending-recheck"])
  };
}

// A successful check must be persisted BEFORE it may leave a held queue.
// This touches only the small resume queue(s); saved bot/history data is never
// removed. Active queues from another Settings tab are never rewritten.
async function botStatusRetireCheckedHeldSources(doneIds, heldSources, currentKind) {
  if (!doneIds.size) return;
  for (const kind of ["main", "stale"]) {
    if (kind === currentKind || ![...doneIds].some(id => heldSources[id]?.includes(kind))) continue;
    try {
      const key = botStatusQueueKey(kind);
      const snapshot = await botStatusPausedQueue(kind);
      if (!snapshot || snapshot.phase === "running") continue;
      const currentHeld = botStatusHeldEntries(snapshot);
      const nextHeld = currentHeld.filter(item => !(
        doneIds.has(item.id) && heldSources[item.id]?.includes(kind)));
      if (nextHeld.length === currentHeld.length) continue;
      // Avoid overwriting another Options tab's newer resume state.
      const latest = await botStatusPausedQueue(kind);
      if (JSON.stringify(latest) !== JSON.stringify(snapshot) || !botAvailabilityScanRunning) continue;
      const replacement = { ...snapshot, heldIds: nextHeld, updatedAt: Date.now() };
      await storageSetVerified({ [key]: replacement });
    } catch (error) {
      // Cross-queue retirement is optional. A failed write leaves the source
      // hold recoverable for the next explicit refresh; never fail scan finalization.
      console.warn("[SpicyChat QoL] Could not retire a completed held Bot Status check", error);
    }
  }
}

function botStatusReconciledQueue(queue) {
  if (!queue || !Array.isArray(queue.ids)) return { queue, changed: false };
  let currentMode = String(queue.mode || 'all');
  let currentScope = String(queue.scope || 'all');
  const active = [...new Set(queue.ids.map(id => String(id || '').trim().toLowerCase()).filter(validBotId))];
  const held = botStatusHeldEntries(queue);
  if (!active.length && !held.length) return { queue, changed: false };
  const assessed = botStatusAssessHeldEntries(held);
  const retained = assessed.filter(item => item.category !== 'completed');
  const sameOrigin = retained.filter(item => item.mode === currentMode && item.scope === currentScope);
  let otherOrigin = retained.filter(item => item.mode !== currentMode || item.scope !== currentScope);
  const review = reviewBotStatusQueueEligibility({ mode: currentMode, scope: currentScope,
    ids: [...active, ...sameOrigin.map(item => item.id)] });
  const recoverable = botStatusSavedHeldScanSources(queue.manualHeldScanSources);
  const blockedIds = new Set(normalizeBotStore(blockedState).ids.map(id => String(id).toLowerCase()));
  const excluded = new Map(review.unavailable.filter(item =>
    !recoverable[item.id] || botStatusIdIgnored(item.id) || blockedIds.has(item.id)
  ).map(item => [item.id, item.reason]));
  // Existing active work can never bypass a block/ignore simply because its
  // original scope happens to include blocked bots.
  for (const id of review.ids) {
    if (botStatusIdIgnored(id)) excluded.set(id, 'Deliberately excluded from Bot Status');
    else if (blockedIds.has(id)) excluded.set(id, 'Currently blocked; scan is not permitted');
  }
  const previousHeld = new Map(held.map(item => [item.id, item]));
  let nextActive = review.ids.filter(id => !excluded.has(id));
  let nextHeld = [...otherOrigin, ...review.ids.filter(id => excluded.has(id)).map(id => ({
    id, mode: currentMode, scope: currentScope,
    reason: excluded.get(id), since: previousHeld.get(id)?.since || Date.now()
  }))];
  // A queue that has only holds may have inherited entries from a different
  // scan origin. Release one eligible origin at a time into its own saved mode
  // instead of allowing an unrelated Resume mode to silently scan those IDs.
  if (!nextActive.length) {
    const promotion = otherOrigin.find(item => item.category === 'eligible');
    if (promotion) {
      currentMode = promotion.mode;
      currentScope = promotion.scope;
      const promoted = otherOrigin.filter(item => item.category === 'eligible' &&
        item.mode === currentMode && item.scope === currentScope);
      const promotedIds = new Set(promoted.map(item => item.id));
      nextActive = promoted.map(item => item.id);
      nextHeld = nextHeld.filter(item => !promotedIds.has(item.id));
    }
  }
  // Deduplicate across the active and held buckets. Keep the earliest hold
  // with its original origin/age, even if a prior version saved duplicates.
  const activeSet = new Set(nextActive);
  const seenHeld = new Set();
  nextHeld = nextHeld.filter(item => {
    if (activeSet.has(item.id) || seenHeld.has(item.id)) return false;
    seenHeld.add(item.id); return true;
  }).map(item => ({id:item.id,mode:item.mode,scope:item.scope,
    reason:botStatusIdIgnored(item.id) ? 'Deliberately excluded from Bot Status' :
      blockedIds.has(item.id) ? 'Currently blocked; scan is not permitted' :
      item.reason, since:item.since}));
  const replacement = { ...queue, mode:currentMode, scope:currentScope, ids:nextActive, heldIds:nextHeld };
  const same = JSON.stringify({mode:queue.mode,scope:queue.scope,ids:queue.ids,heldIds:queue.heldIds}) ===
    JSON.stringify({mode:replacement.mode,scope:replacement.scope,ids:replacement.ids,heldIds:replacement.heldIds});
  return { queue:replacement, changed:!same };
}

async function botStatusReconcileSavedQueue(kind, snapshot) {
  if (!snapshot || botAvailabilityScanRunning || botStatusScanNeedsReload) return snapshot;
  // Another Settings tab may still be running a scan. Its checkpoints are
  // written at least every few completed checks. Only a running checkpoint
  // with no updates for five minutes is considered abandoned after reload.
  // Never overwrite a fresh running queue from a different Options tab.
  const abandoned = snapshot.phase === 'running' &&
    Date.now() - Number(snapshot.updatedAt || 0) >= 5 * 60 * 1000;
  if (snapshot.phase === 'running' && !abandoned) return snapshot;
  // Verify before modifying a queue that may be updated in another Options tab.
  // If the queue changed, leave it untouched; the next explicit refresh retries.
  const proposed = botStatusReconciledQueue(snapshot);
  if (!proposed.changed && !abandoned) return snapshot;
  const key = botStatusQueueKey(kind);
  const latest = await botStatusPausedQueue(kind);
  if (JSON.stringify(latest) !== JSON.stringify(snapshot) || botAvailabilityScanRunning) return latest;
  const replacement = { ...proposed.queue, phase: abandoned ? 'paused' : proposed.queue.phase,
    updatedAt: Date.now(),
    reason: abandoned ? 'Recovered an interrupted scan checkpoint; pending IDs and history preserved'
      : proposed.queue.ids.length ? "Eligible pending checks retained" : "Out-of-scope checks safely held" };
  if (!await storageSetVerified({ [key]: replacement })) return snapshot;
  return replacement;
}

async function reviewAndRemoveIneligibleBotStatusPending() {
  await ensureSavedListsDataLoaded();
  await ensureSavedRecoveryDataLoaded();
  await refreshBotStatusPauseButton();
  const [main, stale] = await botStatusPausedQueues();
  const rows = botStatusAssessHeldEntries([
    ...botStatusHeldEntries(main).map(item => ({...item, queueKind:'main'})),
    ...botStatusHeldEntries(stale).map(item => ({...item, queueKind:'stale'}))
  ]);
  const panel = $('botStatusHeldDetails');
  const list = $('botStatusHeldDetailsList');
  if (!panel || !list) {
    showSettingsToast(`${rows.length} held check(s); unable to display detailed review.`);
    return;
  }
  panel.hidden = false;
  list.replaceChildren();
  if (!rows.length) {
    const p = document.createElement('p');
    p.textContent = 'No held checks remain. Saved bot records were not deleted.';
    list.append(p); return;
  }
  const summary = document.createElement('p');
  const counts = new Map();
  for (const row of rows) counts.set(row.category,(counts.get(row.category)||0)+1);
  const currentlyActionable = rows.filter(row => row.manualRetryAllowed).length;
  summary.textContent = `${rows.length} held queue records: ${[...counts].map(([kind,num])=>`${num} ${kind}`).join(' · ')}. ${currentlyActionable} actionable now; ${rows.length-currentlyActionable} excluded or already completed. Historical holds are not proof that a check remains pending. Each entry shows its saved source, current eligibility, and safe next action. No checks happen until you request them.`;
  list.append(summary);
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.textContent = 'Copy held-ID diagnostics';
  copyButton.addEventListener('click', async () => {
    const safeReport = rows.map(({id, queueKind, scope, mode, category, reason, originalReason, action,
      status, checkedAt, sources, hasCopy}) => ({id, queueKind, mode, scope, category, reason,
      originalReason, action, status, checkedAt, sources, hasCopy}));
    try {
      await navigator.clipboard.writeText(JSON.stringify({version:1,generatedAt:new Date().toISOString(),entries:safeReport},null,2));
      showSettingsToast('Copied individual held-ID reasons. Your saved records were not changed.');
    } catch { showSettingsToast('Clipboard unavailable; review the individual reasons below.'); }
  });
  list.append(copyButton);
  const eligible = rows.filter(item => item.manualRetryAllowed);
  if (eligible.length) {
    const allButton = document.createElement('button');
    allButton.type = 'button'; allButton.textContent = `Recheck recoverable held IDs (${new Set(eligible.map(item=>item.id)).size})`;
    allButton.addEventListener('click', () => runBotAvailabilityScan({mode:'stale', heldOnlyIds:eligible.map(item=>item.id)}));
    list.append(allButton);
  }
  for (const row of rows) {
    const entry = document.createElement('div');
    entry.className = 'sub-card';
    const heading = document.createElement('strong');
    heading.textContent = `${row.id} · ${row.category}`;
    const detail = document.createElement('p');
    detail.className = 'hint';
    detail.textContent = `${row.manualRetryAllowed ? 'ACTIONABLE — manual recheck permitted' : 'NOT ACTIONABLE — no manual scan'}: ${row.reason}. Saved in ${row.queueKind} (${row.mode}/${row.scope}); last result ${row.status}${row.checkedAt ? `, checked ${new Date(row.checkedAt).toLocaleString()}` : ''}; ${row.hasCopy?'saved copy present':'no saved copy'}; ${row.action}.${row.originalReason && row.originalReason !== row.reason ? ` Previous saved reason: ${row.originalReason}.` : ''}`;
    entry.append(heading, detail);
    if (row.manualRetryAllowed) {
      const retry = document.createElement('button');
      retry.type = 'button'; retry.textContent = 'Recheck this ID';
      retry.addEventListener('click', () => runBotAvailabilityScan({mode:'stale',heldOnlyIds:[row.id]}));
      entry.append(retry);
    }
    list.append(entry);
  }
}

// Defined by the lightweight Settings loader so the read-only summary works before scan tools load.

let botStatusPauseRefreshInFlight = null;
async function refreshBotStatusPauseButton() {
  // Duplicate Settings panel refreshes must not reconcile the same queues and
  // repeatedly walk the full source lists while the first read is still slow.
  if (botStatusPauseRefreshInFlight) return botStatusPauseRefreshInFlight;
  const request = refreshBotStatusPauseButtonNow();
  botStatusPauseRefreshInFlight = request;
  try { return await request; }
  catch (error) {
    const hint = $("botStatusPendingQueueSummary");
    if (hint) hint.textContent = `Could not read Bot Status resume queues: ${String(error?.message || error)}. No saved checks were removed. Do not start another scan until storage responds.`;
    return { main: null, stale: null, readError: true };
  }
  finally { if (botStatusPauseRefreshInFlight === request) botStatusPauseRefreshInFlight = null; }
}
async function refreshBotStatusPauseButtonNow() {
  let [state, staleState] = await botStatusPausedQueues();
  if (!botAvailabilityScanRunning && ((state?.ids?.length || state?.heldIds?.length) || (staleState?.ids?.length || staleState?.heldIds?.length))) {
    await ensureSavedListsDataLoaded();
    await ensureSavedRecoveryDataLoaded();
    [state, staleState] = await Promise.all([
      botStatusReconcileSavedQueue("main", state),
      botStatusReconcileSavedQueue("stale", staleState)
    ]);
  }
  const allHeld = [...botStatusHeldEntries(state), ...botStatusHeldEntries(staleState)];
  const heldCount = allHeld.length;
  const assessedHeld = botStatusAssessHeldEntries(allHeld);
  const blockedIds = new Set(normalizeBotStore(blockedState).ids.map(id => String(id).toLowerCase()));
  botStatusRecoverableHeldCount = new Set(assessedHeld
    .filter(item => botStatusManualHeldRetryAllowed(item, blockedIds))
    .map(item => item.id)).size;
  const heldReasonCounts = new Map();
  for (const item of assessedHeld) heldReasonCounts.set(item.category, (heldReasonCounts.get(item.category) || 0) + 1);
  const heldReasons = [...heldReasonCounts].slice(0, 3).map(([reason, count]) => `${count} ${reason}`).join("; ");
  const normalIds = (state?.ids || []).filter(validBotId);
  const staleIds = (staleState?.ids || []).filter(validBotId);
  botStatusPendingReviewIds = new Set([...normalIds, ...staleIds]);
  const count = normalIds.length;
  const staleCount = staleIds.length;
  const savedAt = Number(state?.updatedAt || 0);
  const checkpointDetail = count && savedAt
    ? `Last durable checkpoint: ${Math.max(0, Number(state?.completed || 0))} completed in that attempt, ${new Date(savedAt).toLocaleString()}. Uncheckpointed checks may be repeated.${state?.phase === "running" && !botAvailabilityScanRunning ? " The prior worker may have been closed by a browser or extension reload; Resume uses the saved queue." : ""}`
    : "";
  const staleButton = $("resumePausedStaleBotAvailability");
  if (staleButton) {
    staleButton.disabled = botAvailabilityScanRunning || !staleCount;
    staleButton.hidden = !staleCount;
    staleButton.textContent = staleCount
      ? `Resume stale refresh (${staleCount})`
      : "Resume stale refresh";
  }
  const button = $("resumePausedBotAvailability");
  if (button) {
    button.disabled = botAvailabilityScanRunning || !count;
    button.hidden = !count;
    button.textContent = count
      ? `${state?.phase === "running" ? "Resume interrupted scan" : "Resume pending rechecks"} (${count})`
      : "Resume pending rechecks";
  }
  const hint = $("botStatusPendingQueueSummary");
  if (hint) hint.textContent = [
    count ? `${count} regular pending rechecks saved for Resume. ${checkpointDetail}` : "No regular scan pending.",
    staleCount ? `${staleCount} stale-refresh checks saved separately.` : "No stale refresh pending.",
    heldCount ? `${heldCount} checks held automatically: ${heldReasons}. ${botStatusRecoverableHeldCount} available for manual recheck. Open Why held for individual reasons. Nothing deleted.` : "No out-of-scope checks held.",
    "Regular and stale queues stay independent."
  ].join(" ");
  const reviewButton = $("botStatusReviewOutOfScopePending");
  if (reviewButton) {
    // Listing scans may hold thousands of records. Keep this refresh cheap;
    // compute actual eligibility only when the user opens Review.
    reviewButton.hidden = heldCount === 0;
    reviewButton.disabled = botAvailabilityScanRunning;
    reviewButton.textContent = `Why held (${heldCount})`;
  }
  // The status presentation may have rendered before this asynchronous count
  // finished. Keep the button responsive without rebuilding thousands of cards.
  const heldScanButton = $('scanStaleBotAvailability');
  if (heldScanButton && !botAvailabilityScanRunning) {
    const trackedStale = Math.max(0, Number(botStatusTrackedStaleCount || 0));
    heldScanButton.disabled = trackedStale === 0 && botStatusRecoverableHeldCount === 0;
    heldScanButton.textContent = trackedStale && botStatusRecoverableHeldCount
      ? `Refresh stale + held bots (${trackedStale + botStatusRecoverableHeldCount})`
      : trackedStale ? `Refresh stale bots (${trackedStale})`
      : botStatusRecoverableHeldCount ? `Refresh held bot checks (${botStatusRecoverableHeldCount})` : 'No stale or held bots';
  }
  return { main: state, stale: staleState };
}

// Serialize scan preparation and execution within this Settings page; where
// supported, use the extension origin's Web Lock to prevent two Settings
// tabs from writing competing checkpoints. No worker migration or polling.
let botStatusScanInvocationActive = false;
async function runBotAvailabilityScan(options = {}) {
  if (botStatusScanInvocationActive) return;
  if (botStatusScanNeedsReload) {
    showSettingsToast("Reopen QoL Settings before resuming. A previous scan save could not be verified; reload the durable records first.");
    return;
  }
  botStatusScanInvocationActive = true;
  // Closing the dedicated workspace interrupts this UI-owned scan. Warn only
  // during an active invocation; the existing durable checkpoint remains the
  // authority even if the browser does not show an unload prompt.
  const warnDuringScan = event => { event.preventDefault(); event.returnValue = ""; };
  window.addEventListener("beforeunload", warnDuringScan);
  try {
    const locks = typeof navigator !== "undefined" ? navigator.locks : null;
    if (locks?.request) {
      // Do not retry the scan on an exception after the callback has started.
      let entered = false;
      try {
        return await locks.request("ds-qol-bot-status-scan-v1", { ifAvailable: true }, async lock => {
          entered = true;
          if (!lock) { showSettingsToast("Bot Status is already running in another Settings page."); return; }
          return await runBotAvailabilityScanOwned(options, true);
        });
      } catch (error) {
        if (entered) throw error;
        // Some WebViews expose the API but deny access to it.
      }
    }
    return await runBotAvailabilityScanOwned(options, false);
  } finally {
    botStatusScanInvocationActive = false;
    window.removeEventListener("beforeunload", warnDuringScan);
  }
}

async function runBotAvailabilityScanOwned(options = {}, hasSharedLock = false) {
  await ensureSavedListsDataLoaded();
  await ensureSavedRecoveryDataLoaded();
  savedRecoveryActivated.add("status");
  if (botAvailabilityScanRunning) return;
  // Only resume a queue when its own Resume control was clicked (or the user
  // explicitly agrees to resume that same scan type). Stale refreshes must
  // never consume or overwrite the stopped normal/unchecked queue.
  const requestedMode = String(options?.mode || (options?.uncheckedOnly === true ? "unchecked" : "all"));
  const queueKind = options?.resume
    ? (options?.queue === "stale" ? "stale" : "main")
    : (requestedMode === "stale" ? "stale" : "main");
  const queueKey = botStatusQueueKey(queueKind);
  let preparedQueue, initialQueues;
  try {
    const queues = initialQueues = await botStatusPausedQueues();
    // Without a shared lock a recent running checkpoint may belong to a
    // different Settings page. Preserve it rather than start a second scan.
    if (!hasSharedLock && queues.some(queue => queue?.phase === "running" &&
        Date.now() - Number(queue.updatedAt || 0) < 5 * 60 * 1000)) {
      const message = "A recent Bot Status checkpoint may belong to another Settings page. Wait for it to finish or for the five-minute recovery window before resuming.";
      if ($("botAvailabilityScanStatus")) $("botAvailabilityScanStatus").textContent = message;
      showSettingsToast(message);
      return;
    }
    const originalQueue = queues[queueKind === "stale" ? 1 : 0];
    preparedQueue = await botStatusReconcileSavedQueue(queueKind, originalQueue);
  } catch (error) {
    const message = `${String(error?.message || error)} Saved Bot Status records were not changed.`;
    const scanStatus = $("botAvailabilityScanStatus");
    if (scanStatus) scanStatus.textContent = message;
    showSettingsToast(message);
    return;
  }
  const pausedQueue = options?.resume ? preparedQueue : null;
  // Held work is never dropped. Explicit full/stale Refresh can retry
  // non-excluded held IDs even after their original source was untracked.
  const heldIds = botStatusHeldEntries(preparedQueue);
  let manualHeldScanSources = options?.resume
    ? botStatusSavedHeldScanSources(preparedQueue?.manualHeldScanSources) : {};
  if (!options?.resume) {
    const unfinished = preparedQueue;
    if (unfinished?.ids?.length) {
      // Save the existing queue, and offer to resume only this scan type.
      const isStale = queueKind === "stale";
      const resumeNow = confirm(isStale
        ? `${unfinished.ids.length} stale refresh checks are pending.\n\nOK: Resume this stale refresh.\nCancel: Leave the stale queue untouched.\n\nYour other paused Bot Status scan will not run.`
        : `${unfinished.ids.length} Bot Status rechecks are still pending.\n\nOK: Resume those IDs first.\nCancel: Keep the queue untouched and don't start a new scan.\n\nUse Refresh stale bots separately without resuming this queue.`);
      if (resumeNow) await runBotAvailabilityScanOwned({ resume: true, queue: queueKind }, hasSharedLock);
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
  // Prioritize safely recoverable held checks during an explicit Refresh.
  // Read both queues once, but do NOT consume one queue through the other:
  // completed results retire the originating hold only after final persistence.
  if (!options?.resume && (mode === "all" || mode === "stale")) {
    let mainSnapshot, staleSnapshot;
    try {
      // The shared scan lock excludes competing v0.2.98 scan writers. Reuse
      // the just-read pair and the reconciled current queue rather than
      // fetching both large resume queues a second time.
      [mainSnapshot, staleSnapshot] = hasSharedLock ? initialQueues : await botStatusPausedQueues();
      if (queueKind === "main") mainSnapshot = preparedQueue;
      else staleSnapshot = preparedQueue;
    } catch (error) {
      const message = `${String(error?.message || error)} No Bot Status checks were started and saved queue records were not changed.`;
      const scanStatus = $("botAvailabilityScanStatus");
      if (scanStatus) scanStatus.textContent = message;
      showSettingsToast(message);
      return;
    }
    const originSnapshots = { main: mainSnapshot, stale: staleSnapshot };
    for (const kind of ["main", "stale"]) {
      const origin = originSnapshots[kind];
      if (!origin || origin.phase === "running") continue;
      const reviewed = botStatusAssessHeldEntries(botStatusHeldEntries(origin));
      for (const item of reviewed) {
        if (!botStatusManualHeldRetryAllowed(item, blockedIds)) continue;
        if (Array.isArray(options?.heldOnlyIds) && !options.heldOnlyIds.includes(item.id)) continue;
        (manualHeldScanSources[item.id] ||= []).push(kind);
      }
    }
  }
  // In an interrupted manual recovery, pending IDs must still be selectable
  // even if they remain absent from tracked lists. No profile request is made
  // to reconstruct the selection: saved status/archive data is sufficient.
  const manualHeldIds = Object.keys(manualHeldScanSources).filter(id =>
    !botStatusIdIgnored(id) && !blockedIds.has(id));
  const sourceEntries = new Map(allEntries.map(entry => [entry.id, entry]));
  const manualEntries = manualHeldIds.map(id =>
    sourceEntries.get(id) || botStatusRecoveryEntry(id, existingAvailability, archives));
  if (options?.resume) {
    // Resume still obeys the saved pending-ID order further below.
    allEntries.push(...manualEntries.filter(entry => !sourceEntries.has(entry.id)));
  } else if (manualEntries.length) {
    const manuallyQueued = new Set(manualHeldIds);
    entries = [...manualEntries, ...entries.filter(entry => !manuallyQueued.has(entry.id))];
  }
  // Individual/manual held reviews run only the explicit IDs. A stale queue
  // already pending is still offered for Resume instead of overwritten.
  if (!options?.resume && Array.isArray(options?.heldOnlyIds)) {
    const selectedHeld = new Set(options.heldOnlyIds.map(id => String(id || '').toLowerCase()).filter(validBotId));
    entries = entries.filter(entry => selectedHeld.has(entry.id) &&
      Object.prototype.hasOwnProperty.call(manualHeldScanSources, entry.id));
  }
  // Rescued checks go first; all remaining tracked work stays in its prior
  // priority order. Never add duplicates or change the saved scan time caps.
  const priorityHeld = new Set(manualHeldIds);
  entries = [...entries.filter(entry => priorityHeld.has(entry.id)),
    ...sortBotStatusRefreshQueue(entries.filter(entry => !priorityHeld.has(entry.id)), existingAvailability, archives)];
  if (options?.resume) {
    const pending = new Set(pausedQueue.ids.filter(validBotId));
    const order = new Map(pausedQueue.ids.map((id, position) => [id, position]));
    entries = allEntries.filter(entry => pending.has(entry.id))
      .sort((a,b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
  }
  // If membership changes between reconciliation and scan preparation,
  // hold those IDs durably as well rather than querying or losing them.
  const resumeEntryIds = options?.resume ? new Set(entries.map(entry => entry.id)) : null;
  const unresolvablePendingIds = options?.resume
    ? pausedQueue.ids.filter(validBotId).filter(id => !resumeEntryIds.has(id))
    : [];
  // Some imported/resumed sources can accidentally repeat the same ID.
  // Check each ID only once per run, keeping its first position in a resumed
  // queue. Saved queue checkpoints and progress refer to this deduped list.
  const candidateIdSet = new Set();
  const candidateCountBeforeDedup = entries.length;
  entries = entries.filter(entry => {
    const id = String(entry?.id || '').trim().toLowerCase();
    if (!id || candidateIdSet.has(id)) return false;
    candidateIdSet.add(id);
    return true;
  });
  const duplicateQueueEntries = candidateCountBeforeDedup - entries.length;
  const totalCandidates = entries.length;
  const maxBots = botStatusPositiveLimit("botStatusMaxBots", 100000);
  const maxMinutes = botStatusPositiveLimit("botStatusMaxMinutes", 1440);
  const maximumRuntimeMs = maxMinutes ? maxMinutes * 60 * 1000 : 0;
  if (unresolvablePendingIds.length && pausedQueue) {
    const reasons = new Map(reviewBotStatusQueueEligibility({ ...pausedQueue,
      ids: unresolvablePendingIds }).unavailable.map(item => [item.id, item.reason]));
    for (const id of unresolvablePendingIds) {
      if (heldIds.some(item => item.id === id)) continue;
      heldIds.push({ id, mode, scope, reason: reasons.get(id) || "No longer in the original scan scope", since: Date.now() });
    }
  }
  const omittedByBotLimit = [
    ...(maxBots && entries.length > maxBots ? entries.slice(maxBots).map(item => item.id) : [])
  ];
  if (maxBots && entries.length > maxBots) entries = entries.slice(0, maxBots);

  const status = $("botAvailabilityScanStatus");
  const archivedStatus = mode === "archived" ? $("deletedSavedBotRecheckStatus") : null;
  if (!entries.length) {
    if (unresolvablePendingIds.length && pausedQueue) {
      const saved = await storageSetVerified({ [queueKey]: { ...pausedQueue, ids: [], heldIds,
        phase: "paused", updatedAt: Date.now(), reason: "Out-of-scope checks safely held" } });
      const message = saved
        ? `${unresolvablePendingIds.length} no-longer-eligible Bot Status checks were automatically held for later. Nothing was deleted or rechecked.`
        : "Could not safely save the out-of-scope Bot Status checks; the previous queue was preserved.";
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
  let verifiedClassificationCount = 0;
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
  // Only unacknowledged changes need to be visited at each checkpoint.
  const pendingDeltaIds = new Set();
  let checkpointCount = 0;
  let finalResultsSaved = true;
  let initialQueueVerified = false;
  let helperRequested = false;
  const metadataDirtyKeys = new Set();
  // Recovery memberships must be durable before a recovered bot's result
  // can advance the queue. Otherwise an interrupted archived scan may see
  // an Available result on restart and never restore the saved memberships.
  async function saveScanMemberships(includeMetadata = false) {
    if (!recoveryStateDirty && !(includeMetadata && botStatusMetadataDirty)) return true;
    const payload = botStatusMetadataDirty ? botStatusMetadataStoragePayload(metadataDirtyKeys) : {};
    if (recoveryStateDirty) {
      Object.assign(payload, botStatusRecoveryStoragePayload({ restoreBlockedIds: [...recoveredBlockedIds] }).payload);
      if (recoveredBlockedIds.size) {
        const stored = await storageGetChecked(["settings"]);
        if (!stored.ok) return false;
        const settings = stored.data.settings || {};
        // Only write the two affected granular settings, not the entire
        // Settings snapshot (which could overwrite unrelated newer edits).
        payload.settings = {
          blockedBotIds: uniqueClean([...(settings.blockedBotIds || []), ...recoveredBlockedIds]).filter(validBotId),
          blockedBotNames: []
        };
      }
    }
    if (!await storageSet(payload)) return false;
    recoveryStateDirty = false;
    botStatusMetadataDirty = false;
    metadataDirtyKeys.clear();
    recoveredBlockedIds.clear();
    return true;
  }
  // Large scans would rewrite thousands of pending IDs after every 10 checks.
  // Allow up to 20 per count-triggered checkpoint on 2k+ targets while keeping
  // the same 10-second time-triggered limit. Completed deltas are persisted
  // BEFORE the queue advances, so interruption can repeat but never skip work.
  const checkpointEvery = entries.length >= 2000 ? 20 : BOT_STATUS_PROGRESS_EVERY;
  async function saveScanCheckpoint(force = false) {
    const pending = [...pendingDeltaIds];
    // Checkpoint restored memberships before acknowledging result deltas.
    if (!await saveScanMemberships()) return false;
    if (!pending.length || (!force && pending.length < checkpointEvery)) return true;
    const availabilityUpdates = Object.fromEntries(pending.map(id => [id, botAvailabilityState.meta?.[id]]).filter(([, v]) => !!v));
    const archiveUpdates = Object.fromEntries(pending.filter(id => archiveChangedIds.has(id)).map(id => [id, botArchiveState.meta?.[id]]).filter(([, v]) => !!v));
    const saved = await runtimeMessageWithTimeout(
      { type: "DS_BOT_STATUS_PERSIST_DELTA", availabilityUpdates, archiveUpdates }, 25000);
    if (!saved?.ok || Number(saved.availability) !== Object.keys(availabilityUpdates).length ||
        Number(saved.archive) !== Object.keys(archiveUpdates).length ||
        Object.keys(availabilityUpdates).length !== pending.length) return false;
    pending.forEach(id => pendingDeltaIds.delete(id));
    checkpointCount += pending.length;
    return true;
  }
  let terminalMessage = "";
  let timeLimitReached = false;
  let scanStartedAt = 0;
  let scanLastCheckAt = 0;
  let lastProgressPaintAt = 0;
  let adaptiveDelay = botStatusScanDelayMs();
  let consecutiveAccessFailures = 0;
  const deferredAccessIds = [];
  let accessPauseReason = "";
  let stalledScan = false;
  let nextScanIndex = 0;
  let lastQueueCheckpointAt = 0;
  let lastQueueCheckpointCompleted = 0;
  const runStartedAt = Date.now();
  const uniqueCheckedIds = new Set();
  const completedCheckedIds = new Set();
  let checkAttempts = 0;
  let accessFailures = 0;
  let requestTimeMs = 0;
  let lastAggregateAt = runStartedAt;
  // Existing worker counters are only observed at start and finish. No
  // periodic stats fetch and no per-bot diagnostic events.
  const initialWorkerStats = await runtimeMessageWithTimeout(
    { type: "DS_BOT_STATUS_HELPER_STATS" }, 5000).catch(() => null);
  // The persisted queue is written only AFTER its completed records have been
  // saved. If the tab disappears between those writes, a few bots might be
  // checked again, but no completed result is skipped or lost from the queue.
  async function saveScanProgress(nextIndex, { force = false } = {}) {
    const now = Date.now();
    if (!force && completed - lastQueueCheckpointCompleted < checkpointEvery && now - lastQueueCheckpointAt < BOT_STATUS_PROGRESS_MS) return true;
    if (!(await saveScanCheckpoint(true))) return false;
    // Do not drop bots deferred by the configured limit on a fresh run.
    const pending = botStatusPendingIds(entries, nextIndex, deferredAccessIds, omittedByBotLimit, true);
    // Keep the last completed ID until final persistence has succeeded.
    try {
      const checkpointPayload = { [queueKey]: {
        version: 1, mode, scope, ids: pending, heldIds, manualHeldScanSources, phase: "running",
        updatedAt: now, startedAt: runStartedAt,
        completed, total: entries.length, verifiedClassifications: verifiedClassificationCount,
        inconclusive: unknownCount, reason: "Saved progress"
      } };
      // Verify the initial recoverable queue before issuing ANY API request.
      // On later checkpoints, a successful storage callback is sufficient;
      // all saved result deltas have already been acknowledged by the worker.
      const queueSaved = completed === 0
        ? await storageSetVerified(checkpointPayload)
        : await storageSet(checkpointPayload);
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
    initialQueueVerified = true;
    helperRequested = true;
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
      checkAttempts++;
      uniqueCheckedIds.add(String(entry.id || "").toLowerCase());
      const requestStartedAt = Date.now();
      // The helper has its own deadlines, but this outer watchdog also covers
      // any unexpected unresolved promise in the scan/check orchestration.
      // Stop rather than start another request alongside an unknown in-flight
      // check. The current ID remains in the saved resume tail.
      let checkWatchdogTimer;
      const rawResult = await Promise.race([
        checkBotAvailability(
          { ...entry, ...(previous || {}), sources: uniqueClean([...(previous?.sources || []), ...(entry.sources || [])]) },
          { keepHelper: true, forceOwnHelper: true, bulkScan: true, timeoutMs: 17000 }
        ),
        new Promise(resolve => {
          checkWatchdogTimer = setTimeout(() => resolve({ __dsBotStatusWatchdogTimeout: true }), 30000);
        })
      ]).catch(error => ({
        __dsBotStatusWatchdogTimeout: true,
        error: String(error?.message || error || "Bot Status check failed")
      })).finally(() => clearTimeout(checkWatchdogTimer));
      requestTimeMs += Math.max(0, Date.now() - requestStartedAt);
      if (rawResult?.__dsBotStatusWatchdogTimeout) {
        stalledScan = true;
        terminalMessage = `Bot Status check stalled at ${entry.name || entry.id}. ${completed} completed checks will be saved and the remaining IDs kept for Resume.`;
        break;
      }
      if (isBotStatusAccessFailure(rawResult)) {
        accessFailures++;
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
          // Use the normal finalization path so memberships, result deltas
          // and the verified resume queue commit in the same safe order.
          accessPauseReason = Number(rawResult?.httpStatus) === 429 ? "HTTP 429 rate limit" : "Authentication/network failure";
          const remaining = botStatusPendingIds(entries, nextScanIndex, deferredAccessIds, omittedByBotLimit);
          terminalMessage = `Paused after ${accessPauseReason}. ${remaining.length} bots remain for Resume; verifying the saved checkpoint.`;
          if (status) status.textContent = terminalMessage;
          break;
        }
        if (status) status.textContent = `Temporary auth/network failure ${consecutiveAccessFailures}/${BOT_STATUS_ACCESS_FAILURE_PAUSE_AT}. Skipping ${entry.id} without changing its previous Bot Status result.`;
        if (!await waitForBotStatusPace(Math.max(750, botStatusScanDelayMs()))) {
          stalledScan = true;
          terminalMessage = `Bot Status pacing stopped responding after ${completed} completed checks. Progress and remaining IDs will be saved for Resume.`;
          break;
        }
        continue;
      }
      consecutiveAccessFailures = 0;
      const result = reconcileBotUpdate(previous, rawResult);
      if (result.updateStatus === "updated" && Number(result.updateDetectedAt || 0) > Number(previous?.updateDetectedAt || 0)) changesPreserved++;
      if (result.status === "unknown") unknownCount++;
      if (["available", "restricted", "unavailable"].includes(result.status) &&
          Number(result.unavailableEvidenceCount || 0) !== 1) verifiedClassificationCount++;
      if (Number(result.unavailableEvidenceCount || 0) === 1 && result.status !== "unavailable") candidateCount++;
      if (mode === "archived") {
        if (result.status === "unavailable") stillUnavailableCount++;
        else if (result.status === "restricted") restrictedCount++;
        else if (result.status !== "available") retryLaterCount++;
      }
      botAvailabilityState.meta[result.id] = result;
      availabilityChangedIds.add(result.id);
      pendingDeltaIds.add(result.id);
      if (applyAuthoritativeBotMetadata(rawResult, metadataIndex, metadataDirtyKeys)) botStatusMetadataDirty = true;
      const blockedFromRecovery = metadataIndex?.blocked instanceof Set && metadataIndex.blocked.has(result.id);
      if (rawResult.status === "available" && rawResult.archiveSnapshot && !blockedFromRecovery) {
        const archiveChanged = saveArchiveSnapshotForBot(result.id, rawResult.archiveSnapshot, {
          name: result.name,
          creator: result.creator,
          image: result.image,
          profileUrl: result.profileUrl,
          chatUrls: knownChatUrlsForBot(result.id, metadataIndex),
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
      completedCheckedIds.add(entry.id);
      nextScanIndex = scanIndex + 1;
      scanLastCheckAt = Date.now();
      if (completed % checkpointEvery === 0 || scanLastCheckAt - lastQueueCheckpointAt >= BOT_STATUS_PROGRESS_MS) {
        if (!await saveScanProgress(nextScanIndex, { force: true })) {
          terminalMessage = `Paused after ${completed} checks: could not save the latest checkpoint. Retrying the final save...`;
          break;
        }
        if (status) status.dataset.dsSavedCheckpoints = String(checkpointCount);
        // Aggregate only at an existing checkpoint, at most once per minute.
        // The background receives only numbers and mode/scope labels, not IDs.
        if (scanLastCheckAt - lastAggregateAt >= 60000) {
          lastAggregateAt = scanLastCheckAt;
          await noteBotStatusRunEvent("bot-status-run-progress", {
            mode, scope, completed, requested: entries.length,
            uniqueTargets: uniqueCheckedIds.size, checkAttempts,
            duplicateQueueEntries, accessFailures,
            pending: Math.max(0, entries.length - nextScanIndex) + deferredAccessIds.length + omittedByBotLimit.length,
            requestTimeMs, elapsedMs: scanLastCheckAt - runStartedAt
          });
        }
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
        if (!await waitForBotStatusPace(Math.min(adaptiveDelay, remainingTime))) {
          stalledScan = true;
          terminalMessage = `Bot Status pacing stopped responding after ${completed} completed checks. Progress and remaining IDs will be saved for Resume.`;
          break;
        }
      }
    }
  } finally {
    // Do not let helper cleanup delay or prevent durable scan finalization.
    invalidateDuplicateCache();
    if (completed > 0) {
      // Keep the scan's hot in-memory state as-is. Re-normalizing the entire
      // 6k+ availability table and ~4k rich recovery archive here was a major
      // source of the brief "page stopped responding" stalls at scan finish.
      botStatusStorageSelfWriteUntil = Date.now() + 8000;

      if (status) status.textContent = `Saving ${completed} completed Bot Status checks…`;
      await nextOptionsIdleSlice(120);

      // Reuse the same bounded delta path at completion. A failed worker
      // acknowledgement leaves the last verified queue intact; do not fall
      // back to a full-table overwrite of newer data from another context.
      try {
        if (!await saveScanMemberships(true) || !await saveScanCheckpoint(true)) finalResultsSaved = false;
      } catch (error) {
        finalResultsSaved = false;
        console.warn("[SpicyChat QoL] Bot Status final delta save failed", error);
      }
    }
    let finalQueuePendingCount = null;
    // Only advance/clear the resume queue after the final result and recovery
    // writes above complete. On a page crash, the most recent saved queue is
    // still available and may safely recheck the unfinished tail.
    if (!initialQueueVerified) finalResultsSaved = false;
    if (initialQueueVerified && finalResultsSaved) {
      const outstanding = new Set(botStatusPendingIds(entries, nextScanIndex, deferredAccessIds, omittedByBotLimit));
      const completedHeld = new Set([...completedCheckedIds].filter(id => {
        const result = botAvailabilityState.meta?.[id];
        // Unknown and one-evidence unavailable candidates must remain saved
        // for later verification, never counted as successfully resolved.
        return manualHeldScanSources[id] && !outstanding.has(id) &&
          ['available', 'unavailable', 'restricted'].includes(result?.status) &&
          Number(result?.unavailableEvidenceCount || 0) !== 1;
      }));
      const outstandingHeld = heldIds.filter(item => !completedHeld.has(item.id));
      const remainingHeldSources = Object.fromEntries(Object.entries(manualHeldScanSources)
        .filter(([id]) => !completedHeld.has(id)));
      try {
        const finalQueueSaved = await storageSetVerified({ [queueKey]: (outstanding.size || outstandingHeld.length) ? {
          version: 1, mode, scope, ids: [...outstanding], heldIds: outstandingHeld,
          manualHeldScanSources: remainingHeldSources, phase: "paused",
          updatedAt: Date.now(), startedAt: runStartedAt,
          completed, total: entries.length,
          reason: accessPauseReason || (botAvailabilityStopRequested ? "Stopped" : timeLimitReached ? "Time limit" : omittedByBotLimit.length ? "Bot limit reached" : "Retry skipped checks")
        } : null });
        if (!finalQueueSaved) throw new Error("Could not persist Bot Status resume queue");
        finalQueuePendingCount = outstanding.size;
        if (accessPauseReason) terminalMessage = `Paused after ${accessPauseReason}. ${outstanding.size} pending checks durably saved for Resume.`;
        await botStatusRetireCheckedHeldSources(completedHeld, manualHeldScanSources, queueKind);
        if (outstanding.size && !terminalMessage) terminalMessage = `${completed} Bot Status checks saved. ${outstanding.size} still pending; use Resume paused scan.`;
      } catch (error) {
        finalResultsSaved = false;
        terminalMessage = "Could not verify the saved Resume queue. Earlier checkpoints were kept; do not assume the scan is complete.";
        console.warn("[SpicyChat QoL] Could not finalize Bot Status resume queue", error);
      }
    }
    // In-memory recovery/status changes may differ from durable storage after
    // a failed save. Require a new Settings context before another scan;
    // in particular, do not reconcile held IDs using uncommitted results.
    if (!finalResultsSaved) botStatusScanNeedsReload = true;
    else botStatusMetadataDirty = false;
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
      : `${finalStatusText} Save/queue verification failed; reopen QoL Settings to resume from the last durable checkpoint.`;
    if (status) status.textContent = safeStatusText;
    if (archivedStatus) archivedStatus.textContent = safeStatusText;
    if (helperRequested) await releaseBotStatusHelper();
    const finalWorkerStats = await runtimeMessageWithTimeout(
      { type: "DS_BOT_STATUS_HELPER_STATS" }, 5000).catch(() => null);
    const statsDelta = name => {
      if (!initialWorkerStats?.ok || !finalWorkerStats?.ok) return null;
      const before = Number(initialWorkerStats[name] || 0);
      const after = Number(finalWorkerStats[name] || 0);
      // Service workers may restart during long scans. Never label a reset
      // counter as a genuine zero-retry or zero-cache-hit result.
      return after >= before ? after - before : null;
    };
    const retries = statsDelta("retryAttempts");
    const cacheHits = statsDelta("cached");
    const coalesced = statsDelta("coalesced");
    const outgoingStats = {
      uniqueTargets: uniqueCheckedIds.size, checkAttempts, duplicateQueueEntries,
      accessFailures, requestTimeMs,
      retries, cacheHits, coalesced,
      workerChecks: statsDelta("checked"),
      timeouts: statsDelta("timeouts"),
      outstanding: finalWorkerStats?.ok ? Number(finalWorkerStats.outstanding || 0) : null
    };
    const completionTelemetry = {
      // The lifecycle collector retains the first twelve public counters.
      // Put the actionable run summary first; advanced counts follow.
      mode, scope, completed, requested: entries.length,
      uniqueTargets: outgoingStats.uniqueTargets, checkAttempts,
      retries, cacheHits, accessFailures,
      pending: botStatusPendingIds(entries, nextScanIndex, deferredAccessIds, omittedByBotLimit).length,
      durationMs: Date.now() - runStartedAt,
      stopReason: stalledScan ? "stalled" : terminalMessage ? "error" : botAvailabilityStopRequested ? "manual" : timeLimitReached ? "time" : countLimitReached ? "count" : "complete",
      ...outgoingStats,
      totalCandidates, maxBots, maxMinutes,
      stopped: !!botAvailabilityStopRequested || !!terminalMessage || timeLimitReached || countLimitReached,
      changesPreserved, unknownCount, candidateCount, archiveChangedCount, recoveredCount,
      stillUnavailableCount, restrictedCount, retryLaterCount, archivedBlockedSkipped
    };
    const manuallyStopped = !!botAvailabilityStopRequested;
    botAvailabilityStopRequested = false;
    // Final queue read-back already verified its exact remaining ID set.
    // Write run feedback BEFORE a slow Settings UI refresh or optional event
    // relay can delay publication of the completed/failed-finalization state.
    const pendingCount = finalQueuePendingCount == null
      ? botStatusPendingIds(entries, nextScanIndex, deferredAccessIds, omittedByBotLimit).length
      : finalQueuePendingCount;
    const feedback = {
      at: Date.now(), mode, checked: completed,
      ...outgoingStats,
      cancelled: manuallyStopped,
      interrupted: stalledScan,
      pending: pendingCount,
      deferred: deferredAccessIds.length,
      changed: changesPreserved,
      recovered: recoveredCount,
      unknown: unknownCount,
      saveVerified: finalResultsSaved
    };
    // Record finality to local storage BEFORE optional Inspector/report events.
    // If the event relay stalls or Settings closes, the persisted run summary
    // still says whether final queue/result persistence was verified.
    const feedbackSaved = await storageSet({ [BOT_STATUS_LAST_RUN_FEEDBACK_KEY]: feedback });
    if (!feedbackSaved) console.warn("[SpicyChat QoL] Last-run feedback could not be saved; the durable resume queue is still authoritative");
    await noteBotStatusRunEvent("bot-status-run-complete", completionTelemetry);
    await refreshBotStatusPauseButton();
    const feedbackEl = $("botStatusLastRunSummary");
    if (feedbackEl) feedbackEl.textContent = formatBotStatusLastRunFeedback(feedback);

    // Auto-clean only the blocked IDs touched by this scan, and only after an
    // exact remotely-preserved archive fingerprint is confirmed. Keep this as
    // idle/background work so scan completion stays responsive.
    const blockedCleanupCandidateIds = [...availabilityChangedIds];
    if (finalResultsSaved && blockedCleanupCandidateIds.length) {
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

