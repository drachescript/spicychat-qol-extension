// Manual Bulk Chat & Native Memory Research Export pilot. Nothing runs during normal chats.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  'use strict';
  if (location.pathname !== '/chats' || new URLSearchParams(location.search).get('ds-research-export') !== '1') return;
  const DS = window.DragonScriptQoL;
  if (!DS || DS.featureBuildProfile?.isInstalled?.('bulk-chat-research') === false) return;
  const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const DEFAULT_BOTS = 50, MAX_ZIP_BYTES = 300_000_000, PART_TARGET = 290_000_000;
  const DATABASE = 'dsBulkChatResearchPilotV1', encoder = new TextEncoder();
  let runId = crypto.randomUUID().replaceAll('-', '');
  let cancelled = false, running = false, launching = false;
  let log, startButton, scanButton, quickScanButton, verifyButton, freshButton, cancelButton, githubButton, limitInput, allBotsInput, characterRetryInput;
  let initialSelectionCache = null;
  let progressTitle, progressMeter, progressEta, progressDetail, progressState = null;
  let lastProgressRenderAt = -Infinity;
  let phaseTimingsLabel = null;
  const PROGRESS_LABELS = Object.freeze({
    discover: 'Find recent bots', conversations: 'Check additional conversations',
    export: 'Read chats, Memories and character metadata'
  });
  const progressOrder = mode => mode === 'scan' ? ['discover','conversations'] : ['discover','conversations','export'];
  function progressBegin(mode) {
    progressState = {mode, stage:'discover', count:0, total:null, lastAt:performance.now(),
      averageMs:0, samples:0, detail:'Starting…', done:false};
    renderProgress(true);
  }
  function progressStage(stage, total = null, detail = '') {
    if (!progressState) return;
    const state=progressState;
    if (state.stage!==stage) {
      state.stage=stage; state.count=0; state.samples=0; state.averageMs=0;
    }
    state.total=Number.isFinite(total) && total>0 ? total : null;
    state.lastAt=performance.now(); state.detail=detail;
    renderProgress(true);
  }
  function progressTick(completed, total = null, detail = '') {
    const state=progressState;
    if (!state || state.done) return;
    const now=performance.now();
    const amount=Math.max(0, Math.floor(Number(completed)||0));
    if (amount>state.count) {
      const delta=now-state.lastAt, units=amount-state.count;
      const each=delta/units;
      // Ignore impossible clock jumps, but include network latency and API
      // pacing: those are real elapsed time for an ETA, not CPU cost.
      if (delta>=0 && each>=0 && each<300000) {
        state.averageMs=state.samples ? state.averageMs*0.75+each*0.25 : each;
        state.samples+=units;
      }
      state.lastAt=now;
    }
    state.count=amount;
    if (Number.isFinite(total) && total>0) state.total=total;
    if (detail) state.detail=detail;
    renderProgress();
  }
  function formatDuration(milliseconds) {
    let seconds=Math.max(0,Math.round(milliseconds/1000));
    if (!Number.isFinite(seconds)) return 'unknown';
    if (seconds<60) return `${seconds}s`;
    const minutes=Math.floor(seconds/60);seconds%=60;
    if (minutes<60) return `${minutes}m ${seconds}s`;
    const hours=Math.floor(minutes/60),remain=minutes%60;
    return `${hours}h ${remain}m`;
  }
  function renderProgress(force = false) {
    if (!progressTitle || !progressState) return;
    const now=performance.now();
    // One paint per ~750 ms during a long scan, with immediate stage/finish
    // changes. This is event-driven; no permanent timer or observer is added.
    if (!force && now-lastProgressRenderAt < 750) return;
    lastProgressRenderAt=now;
    const setText=(node,text)=>{ if (node.textContent!==text) node.textContent=text; };
    const state=progressState, steps=progressOrder(state.mode), step=Math.max(0,steps.indexOf(state.stage))+1;
    const total=state.total, count=state.count;
    setText(progressTitle,state.done ? 'Complete' : `Step ${step}/${steps.length} · ${PROGRESS_LABELS[state.stage]}`);
    const percent=Math.round((total ? Math.min(1,count/total) : 0)*100);
    if (progressMeter.style.width!==`${percent}%`) progressMeter.style.width=`${percent}%`;
    const track=progressMeter.parentElement;
    if(track?.getAttribute('aria-valuenow')!==String(percent))track?.setAttribute('aria-valuenow',String(percent));
    setText(progressDetail,state.detail || (total ? `${count}/${total}` : `${count} bots`));
    setText(progressEta,state.done ? 'Finished' : !total ? 'ETA: waiting for total count' :
      count>=total ? 'Step complete' : state.samples<3 || !(state.averageMs>0) ?
      'ETA: calculating from completed items…' :
      `ETA for this step: ~${formatDuration((total-count)*state.averageMs)} (estimate)`);
  }
  function progressFinish() {
    if (!progressState) return;
    progressState.done=true; progressState.detail='All requested work finished';
    progressState.count=progressState.total || progressState.count;
    renderProgress(true);
  }
  function progressStop(reason) {
    if (!progressState || progressState.done) return;
    progressState.done=true;
    renderProgress(true);
    if (progressTitle && progressTitle.textContent!==(reason || 'Stopped')) progressTitle.textContent=reason || 'Stopped';
    if (progressEta && progressEta.textContent!=='ETA unavailable · saved checkpoints preserved') progressEta.textContent='ETA unavailable · saved checkpoints preserved';
  }

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const phaseMs = Object.create(null);
  const phaseCount = Object.create(null);
  const phaseMaxMs = Object.create(null);
  function addPhase(name, milliseconds) {
    if (!Number.isFinite(milliseconds)) return;
    phaseMs[name] = (phaseMs[name] || 0) + milliseconds;
    phaseCount[name] = (phaseCount[name] || 0) + 1;
    phaseMaxMs[name] = Math.max(phaseMaxMs[name] || 0, milliseconds);
  }
  const operationLabels = Object.freeze({
    downloadPermission: 'check-download-permission',
    selectionCheckpointRead: 'read-selection-checkpoint',
    exportDbOpen: 'open-shared-export-checkpoint-database',
    launchToRun: 'wait-for-export-run-lock',
    startupBeforeHistory: 'startup-before-first-chat-history',
    githubResearchIndexRead: 'read-verified-github-research-index',
    incrementalIndexRead: 'index-local-verified-conversations',
    discovery: 'discover-conversations',
    historyReadTotal: 'retrieve-history',
    memoryReadTotal: 'retrieve-native-memories',
    characterReadTotal: 'retrieve-character-metadata',
    storyStateIndex: 'index-rulebook-story-and-ooc',
    linkedLorebookRead: 'retrieve-linked-lorebook',
    zipBuildAndDownloadTotal: 'assemble-and-verify-zip',
    downloadVerification: 'verify-download',
    zipAssemblyTotal: 'prepare-zip-worker-or-fallback',
    downloadDispatchSync: 'dispatch-blob-download-main-thread'
  });
  function phaseAttribution(name, durationMs, outcome = 'completed') {
    if (!DS.isDiagnosticTraceActive?.('normal')) return;
    // Routine successes are represented by one summary at export completion.
    // Only slow outliers and failures need a separate detailed marker.
    if (durationMs < 1000 && outcome === 'completed') return;
    DS.traceEvent?.('research-export', 'phase-outlier', {
      operation: operationLabels[name] || String(name), trigger: 'manual-research-export',
      reason: 'complete-resumable-export', phase: String(name), outcome,
      durationMs: Math.round(durationMs * 100) / 100,
      activeProcessingMs: null, waitAttribution: name === 'downloadPermission' ?
        'browser-permission-or-api-wait-not-cpu' : 'not-isolated'
    }, { critical: outcome === 'failed' || durationMs >= 2000 });
  }
  function phaseTimingsSummary() {
    // Explicit wall time: API phases include network pacing, not just CPU.
    return Object.entries(phaseMs).filter(([,ms])=>Number.isFinite(ms) && ms>=1)
      .sort((a,b)=>b[1]-a[1]).slice(0,9)
      .map(([key,ms])=>`${key}: ${(ms/1000).toFixed(2)}s`).join(' · ');
  }
  function renderPhaseTimings() {
    if (!phaseTimingsLabel) return;
    const text=phaseTimingsSummary();
    const next=text ? `Measured phase wall time (includes waits): ${text}` : 'Phase timings appear after export work completes';
    if (phaseTimingsLabel.textContent!==next) phaseTimingsLabel.textContent=next;
  }
  function addWorkerMetrics(metrics) {
    if (!metrics) return;
    for (const [key, value] of Object.entries(metrics)) if (Number.isFinite(value)) addPhase(`worker-${key}`, value);
  }
  async function measure(name, task) {
    const start = performance.now();
    let outcome = 'completed';
    try { return await task(); }
    catch (error) { outcome = error?.message === 'cancelled' ? 'cancelled' : 'failed'; throw error; }
    finally {
      const wallMs = performance.now() - start;
      addPhase(name, wallMs);
      phaseAttribution(name, wallMs, outcome);
    }
  }
  // The worker is created only after the user starts an export and is terminated
  // at the end; normal browsing pays zero worker/observer cost.
  let archiveWorker = null, archiveWorkerPromise = null, archiveWorkerDisabled = false;
  let archiveBackend = 'not-started';
  let nextWorkerId = 0;
  const workerRequests = new Map();
  function stopArchiveWorker(reason = 'Archive worker stopped') {
    if (archiveWorker) { archiveWorker.terminate(); archiveWorker = null; }
    for (const request of workerRequests.values()) request.reject(Error(reason));
    workerRequests.clear();
    archiveWorkerPromise = null;
  }
  async function startArchiveWorker() {
    if (archiveWorkerDisabled) return null;
    if (archiveWorkerPromise) return archiveWorkerPromise;
    archiveWorkerPromise = (async () => {
      const url = chrome.runtime.getURL('content/bulk-chat-research-worker.js');
      for (const strategy of ['extension', 'blob']) {
        let blobUrl = null, worker = null;
        try {
          if (strategy === 'blob') {
            const response = await fetch(url);
            if (!response.ok) throw Error('Worker source unavailable');
            blobUrl = URL.createObjectURL(new Blob([await response.text()], {type: 'text/javascript'}));
          }
          worker = new Worker(blobUrl || url);
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(Error('Worker start timed out')), 4000);
            worker.onmessage = event => {
              if (event.data?.type !== 'ds-research-worker-ready') return;
              clearTimeout(timeout); resolve();
            };
            worker.onerror = error => {
              clearTimeout(timeout); reject(Error(error?.message || 'Worker failed to load'));
            };
          });
          archiveWorker = worker;
          archiveBackend = strategy === 'extension' ? 'extension-worker' : 'blob-worker';
          worker.onmessage = event => {
            const {id, ok, result, error} = event.data || {};
            const request = workerRequests.get(id);
            if (!request) return;
            workerRequests.delete(id);
            if (ok) request.resolve(result);
            else request.reject(Error(error || 'Research Archive worker failed'));
          };
          worker.onerror = error => stopArchiveWorker(error?.message || 'Archive worker failed');
          return worker;
        } catch (error) {
          worker?.terminate();
        } finally { if (blobUrl) URL.revokeObjectURL(blobUrl); }
      }
      archiveWorkerDisabled = true;
      archiveBackend = 'cooperative-fallback';
      return null;
    })();
    return archiveWorkerPromise;
  }
  async function callArchiveWorker(type, payload, transferable = []) {
    const worker = await startArchiveWorker();
    if (!worker) return null;
    ensureNotCancelled();
    const id = ++nextWorkerId;
    return new Promise((resolve, reject) => {
      workerRequests.set(id, {resolve, reject});
      try { worker.postMessage({id, type, payload}, transferable); }
      catch (error) {workerRequests.delete(id); reject(error);}
    });
  }
  let displayedProgress = '', pendingProgress = '', progressTimer = null, lastProgressAt = 0;
  const STATUS_PAINT_INTERVAL_MS = 850;
  function applyProgress(value) {
    if (log && value !== displayedProgress) {
      log.textContent = value;
      displayedProgress = value;
      lastProgressAt = performance.now();
    }
  }
  function safeRaw(value, depth = 0) {
    if (depth > 25) return '[depth-limit]';
    if (Array.isArray(value)) return value.map(v => safeRaw(v, depth + 1));
    if (!value || typeof value !== 'object') return value;
    const clean = {};
    for (const [key, v] of Object.entries(value)) {
      if (/(?:authorization|credential|password|cookie|api.?key|secret|bearer|jwt|(?:auth|access|refresh|id|session)?_?token(?:$|_))/i.test(key)) continue;
      clean[key] = safeRaw(v, depth + 1);
    }
    return clean;
  }
  function update(message) {
    if (!log || message === displayedProgress || message === pendingProgress) return;
    if (performance.now() - lastProgressAt >= STATUS_PAINT_INTERVAL_MS) {
      if (progressTimer) {clearTimeout(progressTimer); progressTimer = null;}
      pendingProgress = '';
      applyProgress(message);
    } else {
      pendingProgress = message;
      if (!progressTimer) progressTimer = setTimeout(() => {
        progressTimer = null;
        const latest = pendingProgress;
        pendingProgress = '';
        applyProgress(latest);
      }, STATUS_PAINT_INTERVAL_MS);
    }
  }
  function ensureNotCancelled() { if (cancelled) throw new Error('cancelled'); }
  // Reuse one IndexedDB connection during an explicit, single-flight export.
  // Each checkpoint still uses its own transaction and awaits write commits.
  // Close the connection at completion; no idle connection or observer is added.
  let exportDb = null;
  function openDb() {
    if (exportDb) return Promise.resolve(exportDb);
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(DATABASE, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('conversations')) r.result.createObjectStore('conversations', { keyPath: 'conversationId' }); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error || Error('Local checkpoint database unavailable'));
    });
  }
  async function withStore(method, data) {
    const start = performance.now();
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('conversations', method === 'get' ? 'readonly' : 'readwrite');
        const store = tx.objectStore('conversations');
        const dispatchAt = performance.now();
        const request = method === 'get' ? store.get(data) : store.put(data);
        const dispatchMs = performance.now() - dispatchAt;
        addPhase('checkpointDispatchSync', dispatchMs);
        if (dispatchMs >= 32) phaseAttribution('checkpointDispatchSync', dispatchMs);
        // A successful IDB put request is not the same as a committed write.
        // Do not let the next export phase start (or claim a checkpoint saved)
        // until the write transaction has finished. Reloads can otherwise
        // interrupt a request that succeeded but has not committed yet.
        let result;
        request.onsuccess = () => {
          result = request.result;
          if (method === 'get') resolve(result);
        };
        request.onerror = () => reject(request.error);
        if (method !== 'get') tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || Error('Checkpoint failed'));
        tx.onabort = () => reject(tx.error || Error('Checkpoint aborted'));
      });
    } finally {
      if (db !== exportDb) db.close();
      const wallMs = performance.now() - start;
      addPhase(method === 'get' ? 'checkpointRead' : 'checkpointWrite', wallMs);
      if (wallMs >= 500) phaseAttribution(method === 'get' ? 'checkpointRead' : 'checkpointWrite', wallMs);
    }
  }
  async function clearResearchCheckpoints() {
    // Only this research pilot's own IndexedDB records are cleared.
    // Existing downloaded ZIP files and all other QoL data are untouched.
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('conversations', 'readwrite');
        const request = tx.objectStore('conversations').clear();
        request.onerror = () => reject(request.error || Error('Could not reset research checkpoints'));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || Error('Could not reset research checkpoints'));
        tx.onabort = () => reject(tx.error || Error('Research checkpoint reset was cancelled'));
      });
    } finally { if (db !== exportDb) db.close(); }
  }
  async function retry(operation, label, max = 3) {
    let last;
    for (let attempt = 0; attempt < max; attempt++) {
      ensureNotCancelled();
      try { return await operation(); } catch (error) {
        last = error;
        const http = Number(error?.httpStatus || 0);
        if ((http && ![408, 425, 429].includes(http) && http < 500) || attempt + 1 === max) break;
        update(`${label}: retry ${attempt + 1}/${max - 1}...`);
        await sleep([800, 1800][attempt] || 2500);
      }
    }
    throw last;
  }
  function getConversation(row, fallback = null) {
    const declaredBot = String(row?.character_id || row?.character?.id || '').toLowerCase();
    if (declaredBot && fallback?.botId && declaredBot !== fallback.botId) return null;
    const botId = declaredBot || fallback?.botId || '';
    const conversationId = String(row?.id || row?.conversation_id || '').toLowerCase();
    if (!UUID.test(botId) || !UUID.test(conversationId)) return null;
    return { botId, conversationId,
      botName: String(row?.character?.name || row?.character_name || row?.title || fallback?.botName || '').slice(0, 150),
      expectedMessages: Number(row?.num_messages ?? row?.message_count) || null, row: safeRaw(row) };
  }
  function listActivityStamp(entry) {
    const row=entry?.row || {};
    const marker=row.last_message_at ?? row.last_activity_at ?? row.updated_at ??
      row.last_message_id ?? row.last_message?.id ?? row.lastMessageAt ?? row.updatedAt;
    return marker == null ? '' : String(marker).slice(0,120);
  }
  function recentBotChanged(current,previous) {
    if (!previous || current.conversationId !== previous.conversationId ||
        current.expectedMessages !== previous.expectedMessages) return true;
    const next=listActivityStamp(current), old=listActivityStamp(previous);
    return !!(next && old && next!==old);
  }
  async function newestBots(limit, refresh = false, incremental = false) {
    // An All-bots scan follows pagination until the API ends. Checkpoint page
    // progress to avoid starting from page one after cancellation or reload.
    const key = '__recent_bot_scan__';
    const prior = await withStore('get', key);
    // The global /v2/conversations endpoint uses the *character* ID as its
    // last_id cursor, unlike the per-bot conversation endpoint. Invalidate
    // earlier research checkpoints made with conversation IDs. Keep the
    // downloaded per-conversation histories and Memories untouched.
    const cursorScheme = 'global-character-id-v1';
    if (incremental && refresh) {
      // A normal scan is a RECENT HEAD scan, not a full account traversal.
      // Retain complete older discovery records and merge new bot IDs into them.
      // The site may reorder old bots after new messages; never interpret an
      // absent old ID on the recent pages as a deleted conversation.
      const known = prior?.cursorScheme === cursorScheme && Array.isArray(prior.bots)
        ? prior.bots.filter(b => UUID.test(b?.botId)) : [];
      const oldIds = new Set(known.map(b => b.botId));
      const oldBots = new Map(known.map(b => [b.botId,b]));
      const recent = [], found = new Set(), cursors = new Set();
      let cursor = '', page = 0, knownRun = 0, hitEnd = false;
      const recentTarget = Math.min(limit === 'all' ? 120 : limit, 120);
      const pageCap = known.length ? 4 : 2; // only the recent head, never an all-bots traversal
      while (page < pageCap) {
        ensureNotCancelled();
        update(`Finding newest conversations: page ${page + 1} · ${recent.length} recent bots checked`);
        const response = await retry(() => DS.fetchConversationListPage({limit:100,lastId:cursor}), 'Finding newest bots');
        const rows = response?.data;
        if (!Array.isArray(rows)) throw Error('Recent conversation list returned an unexpected response');
        page++;
        if (!rows.length) { hitEnd = true; break; }
        for (const row of rows) {
          const item = getConversation(row);
          if (!item || found.has(item.botId)) continue;
          found.add(item.botId); item.recentHead = true;
          item.recentChanged=recentBotChanged(item,oldBots.get(item.botId));
          recent.push(item);
          knownRun = oldIds.has(item.botId) ? knownRun + 1 : 0;
        }
        if (rows.length < 100) { hitEnd = true; break; }
        // After two recent pages, a long run of previously known bots is a
        // bounded catch-up checkpoint. Full scan remains available when an
        // exhaustive older-bot search is needed.
        if (page >= 2 && recent.length >= recentTarget && knownRun >= 80) break;
        if (limit !== 'all' && recent.length >= limit && knownRun >= 50) break;
        const tail = rows.at(-1);
        const next = String(tail?.character_id || tail?.character?.id || '').toLowerCase();
        if (!UUID.test(next) || next === cursor || cursors.has(next))
          throw Error('Recent bot discovery stopped advancing; saved selection was not replaced');
        cursors.add(next); cursor = next;
        await sleep(300);
      }
      const merged = [...recent];
      for (const bot of known) if (!found.has(bot.botId)) { merged.push(bot); found.add(bot.botId); }
      const selected = limit === 'all' ? merged : merged.slice(0,limit);
      if (!selected.length) throw Error('No recent conversations found');
      const fullCoverage = hitEnd || (prior?.limit === 'all' && prior?.state === 'complete' && !prior?.recentOnly);
      // Keep prior whole-account cache when a smaller numerical scope is
      // selected later; a narrow scan must not discard an exhaustive index.
      const retained = prior?.limit === 'all' ? merged : selected;
      await withStore('put', {conversationId:key, limit:prior?.limit === 'all'?'all':limit,
        cursorScheme,bots:retained,cursors:[],lastId:'',pages:page,state:fullCoverage?'complete':'recent-head',
        recentOnly:true,recentCoverage:fullCoverage?'complete-index-reused':'recent-window-only',updatedAt:Date.now()});
      progressTick(selected.length,selected.length,
        `${recent.length} recent bots · ${Math.max(0,selected.length-recent.length)} previously known bots reused · ${page} pages`);
      return selected;
    }
    const resume = prior?.limit === limit && prior?.cursorScheme === cursorScheme &&
      Array.isArray(prior?.bots) && (prior.state === 'scanning' || (!refresh && prior.state === 'complete' && !prior.recentOnly));
    const bots = resume ? prior.bots : [];
    const seenBots = new Set(bots.map(b => b.botId));
    const seenCursors = new Set(resume && Array.isArray(prior.cursors) ? prior.cursors : []);
    let lastId = resume ? String(prior.lastId || '') : '';
    let page = resume ? Number(prior.pages || 0) : 0;
    let done = resume && prior.state === 'complete';
    while (!done && (limit === 'all' || bots.length < limit)) {
      ensureNotCancelled();
      update(`Finding ${limit === 'all' ? 'all' : limit} recent bots: ${bots.length} found (${page} pages checked)...`);
      progressTick(bots.length,limit === 'all' ? null : limit,`${bots.length} distinct bots · ${page} pages checked`);
      const response = await retry(() => DS.fetchConversationListPage({limit:100,lastId}), 'Finding recent bots');
      const rows = response?.data;
      if (!Array.isArray(rows)) throw Error('Conversation list returned an unexpected response');
      page++;
      if (!rows.length) { done=true; break; }
      for (const row of rows) {
        const item = getConversation(row);
        if (!item || seenBots.has(item.botId)) continue;
        seenBots.add(item.botId); bots.push(item);
        if (limit !== 'all' && bots.length >= limit) break;
      }
      if ((limit !== 'all' && bots.length >= limit) || rows.length < 100) { done=true; break; }
      const finalRow = rows.at(-1);
      const next = String(finalRow?.character_id || finalRow?.character?.id || '').toLowerCase();
      if (!UUID.test(next)) throw Error('Recent-bot page has no valid next bot ID');
      if (next === lastId || seenCursors.has(next))
        throw Error('Recent-bot pagination repeated a page; the scan is not complete');
      seenCursors.add(next); lastId=next;
      // Save often enough for long scans, without writing a growing list on
      // every page. A few repeated pages after a crash are safe to dedupe.
      if (page % 5 === 0) await withStore('put', {conversationId:key,limit,cursorScheme,bots,
        cursors:[...seenCursors],lastId,pages:page,state:'scanning'});
      await sleep(300);
    }
    await withStore('put', {conversationId:key,limit,cursorScheme,bots,
      cursors:[...seenCursors],lastId,pages:page,state:'complete'});
    progressTick(bots.length,bots.length,`${bots.length} bots found · ${page} pages checked`);
    return bots;
  }
  async function scanBotConversations(seed) {
    const entries = []; const seen = new Set(); const cursors = new Set();
    let lastId = '', page = 0;
    while (true) {
      ensureNotCancelled();
      const response = await retry(() => DS.fetchConversationListPage({botId:seed.botId,limit:100,lastId}), 'Finding bot conversations');
      const rows = response?.data;
      if (!Array.isArray(rows)) throw Error('Bot conversations returned an unexpected response');
      page++;
      for (const row of rows) {
        const item = getConversation(row,seed);
        if (!item) throw Error('Bot conversation had an invalid ID or belonged to another bot');
        if (!seen.has(item.conversationId)) {seen.add(item.conversationId);entries.push(item);}
      }
      if (rows.length < 100) break;
      const next=String(rows.at(-1)?.id || rows.at(-1)?.conversation_id || '').toLowerCase();
      if (!UUID.test(next) || next===lastId || cursors.has(next))
        throw Error('Bot conversation pagination stopped advancing');
      cursors.add(next);lastId=next;
      await sleep(300);
    }
    if (!entries.length || !seen.has(seed.conversationId))
      throw Error(`Per-bot chat list did not include the known conversation for ${seed.botName || seed.botId}`);
    // The list metadata is current only after this live per-bot scan. Older
    // cached rows must not be mistaken for a fresh no-change confirmation.
    const listVerifiedAt = Date.now();
    for (const entry of entries) entry.listVerifiedAt = listVerifiedAt;
    return entries;
  }
  function chooseAllBotConversations(groups) {
    // The selected number of BOTS never limits how many conversations they have.
    // Export every chat under each selected bot, with its own history and Memories.
    const selected = [], ownerByConversation = new Map();
    for (const group of groups) {
      for (const entry of group.entries) {
        if (!UUID.test(entry.conversationId) || entry.botId !== group.botId)
          throw Error('Conversation scan returned a mismatched bot or chat ID');
        const owner = ownerByConversation.get(entry.conversationId);
        if (owner && owner !== entry.botId)
          throw Error('Conversation ID unexpectedly belongs to multiple bots');
        if (owner) continue; // Same chat may appear twice across paged API results.
        ownerByConversation.set(entry.conversationId,entry.botId);
        selected.push(entry);
      }
    }
    return selected;
  }
  function selectionNote(selection) {
    const d=selection.discovery;
    const multi=d.multipleBots.map(g=>`${g.name||g.botId.slice(0,8)} (${g.conversations})`).slice(0,8);
    return `Scanned ${d.scannedBots} ${d.scannedBots === 1 ? 'bot' : 'bots'}; ${d.discoveredConversations} conversations found. `+
      `${d.multipleBots.length} ${d.multipleBots.length === 1 ? 'bot has' : 'bots have'} multiple chats${multi.length?`: ${multi.join(', ')}`:''}. `+
      `All ${selection.entries.length} conversations selected across ${d.scannedBots} ${d.scannedBots === 1 ? 'bot' : 'bots'}.`;
  }
  async function discoverSelection(limit, refresh = false, quick = false) {
    progressStage('discover',limit === 'all' ? null : limit,'Finding distinct bots…');
    update(`Finding ${limit === 'all' ? 'all available' : `the newest ${limit}`} distinct bots...`);
    const bots=await newestBots(limit, refresh, quick);
    if(!bots.length)throw Error('No conversations found');
    progressStage('conversations',bots.length,`0/${bots.length} bots checked`);
    // Check every new/changed bot from the global recent-activity feed.
    // Recheck a small head of already-known bots to handle APIs without an
    // activity timestamp; unchanged older bot scans stay in the catalog.
    // Full scan remains exhaustive. Old chats that become active move to the
    // head and are therefore rechecked regardless of their original age.
    const QUICK_SCAN_RECENT_BOTS = 24;
    let rechecked = 0, reused = 0, unverifiedOlder = 0;
    // Reuse the *complete saved selection*, not thousands of separate IDB reads.
    // This also preserves older chats when a partial or transient API response
    // omits them. The normal scan never treats missing older bots as deletions.
    const previous = quick ? await withStore('get','__pilot_selection__') : null;
    const previousByBot = new Map();
    if (quick && Array.isArray(previous?.entries)) {
      for (const entry of previous.entries) {
        if (!UUID.test(entry?.botId) || !UUID.test(entry?.conversationId)) continue;
        if (!previousByBot.has(entry.botId)) previousByBot.set(entry.botId, []);
        previousByBot.get(entry.botId).push(entry);
      }
    }
    const groups=[];
    for(let i=0;i<bots.length;i++) {
      ensureNotCancelled();
      const seed=bots[i],key=`__bot_scan_${seed.botId}`;
      const priorEntries = previousByBot.get(seed.botId);
      const priorScanAt=Number(priorEntries?.[0]?.listVerifiedAt || 0);
      const tooOld=!!(seed.recentHead && priorScanAt && Date.now()-priorScanAt>7*86400000);
      const mustRefresh = refresh && (!quick || (seed.recentHead &&
        (i < QUICK_SCAN_RECENT_BOTS || seed.recentChanged || tooOld || !priorEntries?.length)));
      if (mustRefresh || i % 250 === 0)
        update(`${quick ? 'Updating recent' : 'Checking'} bot ${i+1}/${bots.length} · ${seed.botName||seed.botId}`);
      let cached = null;
      if (!mustRefresh && priorEntries?.length) cached={entries:priorEntries,state:'complete'};
      if (!mustRefresh && !cached) cached=await withStore('get',key);
      if (mustRefresh || !cached || cached.state!=='complete' || !Array.isArray(cached.entries)) {
        if (quick && !mustRefresh && i >= QUICK_SCAN_RECENT_BOTS) {
          // Initial recent scan must never silently turn into an exhaustive
          // API crawl just because old per-bot scan records are absent.
          unverifiedOlder++;
          continue;
        }
        const entries=await scanBotConversations(seed);
        cached={conversationId:key,state:'complete',entries,createdAt:Date.now()};
        await withStore('put',cached);
        rechecked++;
        await sleep(300);
      } else reused++;
      groups.push({botId:seed.botId,botName:seed.botName,entries:cached.entries});
      if (i % 25 === 0 || i + 1 === bots.length)
        progressTick(i+1,bots.length,`${i+1}/${bots.length} known bots · ${rechecked} checked live · ${reused} reused`);
      if (quick && i % 125 === 0) await sleep(0);
    }
    const selected=chooseAllBotConversations(groups);
    const discovery={mode:'per-bot-all-v2',scannedBots:groups.length,
      scanStrategy: quick ? 'incremental-recent-head-plus-cached-history' : refresh ? 'full-refresh' : 'cached-when-available',
      liveBotChecks: rechecked, reusedBotScans: reused, unverifiedOlderBots: unverifiedOlder,
      olderBotConversationListsMayBeStale: !!(quick && reused),
      discoveredConversations:selected.length,
      multipleBots:groups.filter(g=>g.entries.length>1).map(g=>({botId:g.botId,name:g.botName,conversations:g.entries.length}))};
    const selection={conversationId:'__pilot_selection__',mode:'per-bot-all-v2',limit,entries:selected,discovery,createdAt:Date.now()};
    await withStore('put',selection);
    initialSelectionCache = selection;
    await withStore('put',{conversationId:'__pilot_selection_summary__',limit,conversationCount:selected.length,at:Date.now()});
    return selection;
  }
  // A compact verified index separates the retained conversation catalog
  // from the handful of chats which need work today. It is in the SAME IDB
  // store as the export checkpoints; Fresh therefore clears it as well.
  // Never use a row without a verified local ZIP or an independently verified
  // GitHub Research summary. Legacy archives are migrated once, lazily.
  const EXPORT_INDEX_KEY='__pilot_verified_export_index_v1__';
  const AUDIT_INTERVAL_MS=7*86400000;
  function verifiedIndexRow(checkpoint) {
    const history=checkpoint?.history, entry=checkpoint?.entry;
    if (checkpoint?.state!=='verified' || !checkpoint.lastVerifiedPart ||
        history?.complete!==true || !Array.isArray(history.messages) ||
        !history.messages.length || memoryNeedsResume(checkpoint.memory) ||
        !UUID.test(entry?.botId) || !UUID.test(entry?.conversationId)) return null;
    const newest=String(history.messages.at(-1)?.id||'');
    if (!newest || String(history.lastVerifiedMessageId||'')!==newest) return null;
    return {botId:entry.botId,backup:'local',archivePart:String(checkpoint.lastVerifiedPart),
      newestMessageId:newest,savedMessages:history.messages.length,
      listedMessages:Number(entry.expectedMessages)||null,
      activityStamp:listActivityStamp(entry),
      checkedAt:Number(history.lastCheckedAt||history.lastVerifiedAt||checkpoint.at||0),
      fullCheckedAt:Number(history.lastVerifiedAt||checkpoint.at||0)};
  }
  async function loadVerifiedIndex(catalog) {
    let record=await withStore('get',EXPORT_INDEX_KEY);
    if (!record || record.version!==1 || !record.rows || typeof record.rows!=='object') {
      record={conversationId:EXPORT_INDEX_KEY,version:1,rows:{},auditCursor:0};
    }
    let migrated=0,missing=0;
    for (let i=0;i<catalog.length;i++) {
      ensureNotCancelled();
      const entry=catalog[i];
      if (Object.hasOwn(record.rows,entry.conversationId)) continue;
      const old=await withStore('get',entry.conversationId);
      // Record unavailable/unfinished checkpoints as pending; they must not
      // disappear from future work queues, even after a failed export.
      record.rows[entry.conversationId]=verifiedIndexRow(old) || {botId:entry.botId,backup:'pending'};
      migrated++;
      if (record.rows[entry.conversationId].backup==='pending') missing++;
      if (i%50===0) {
        update(`Preparing incremental export index: ${i+1}/${catalog.length} saved conversations checked`);
        await sleep(0);
      }
      if (migrated%250===0) await withStore('put',record);
    }
    if (migrated) await withStore('put',record);
    update(`Incremental catalog ready: ${catalog.length} conversations retained · ${migrated} legacy records indexed · ${missing} need backup or repair`);
    return record;
  }
  function verifiedCatalogRowMatches(entry,row,remote) {
    if (!row || row.botId!==entry.botId) return false;
    if (row.backup==='local') {
      if (!row.archivePart || !row.newestMessageId || !(row.savedMessages>0)) return false;
    } else if (row.backup==='github') {
      if (!remote || remote.messageCount!==row.savedMessages ||
          remote.newestMessageId!==row.newestMessageId) return false;
    } else return false;
    // Cached older lists cannot prove freshness, but a new activity in an
    // ancient conversation moves it into the freshly scanned recent head.
    // Never suppress an explicitly changed count or activity fingerprint.
    if (Number.isSafeInteger(entry.expectedMessages) && entry.expectedMessages>0 &&
        row.listedMessages && entry.expectedMessages!==row.listedMessages) return false;
    const newer=listActivityStamp(entry);
    if (entry.listVerifiedAt && newer && row.activityStamp && newer!==row.activityStamp) return false;
    return true;
  }
  function buildIncrementalQueue(catalog,index,githubRecords,{fresh=false,verifyAll=false,characterMode='reuse'}={}) {
    if (fresh || verifyAll || characterMode!=='reuse')
      return {work:catalog.slice(),auditIds:new Set(),excluded:0,auditing:0,reason:'full-verification-requested'};
    const rows=index.rows, active=[], retained=[];
    for (const entry of catalog) {
      const row=rows[entry.conversationId];
      if (!verifiedCatalogRowMatches(entry,row,githubRecords.get(entry.conversationId))) {
        active.push(entry);
      } else retained.push(entry);
    }
    // Spread infrequent full-history audits over runs rather than forcing a
    // 3,000+ chat scan every time. No records are deleted by a fast scan.
    const auditIds=new Set();
    const budget=Math.min(8,Math.max(2,Math.ceil(catalog.length/800)));
    const now=Date.now();
    if (retained.length) {
      const cursor=Math.max(0,Math.trunc(Number(index.auditCursor)||0)) % retained.length;
      for (let step=0;step<retained.length && auditIds.size<budget;step++) {
        const entry=retained[(cursor+step)%retained.length];
        const lastFull=Number(rows[entry.conversationId]?.fullCheckedAt||0);
        if (!(lastFull>0) || now-lastFull>=AUDIT_INTERVAL_MS) {
          auditIds.add(entry.conversationId);
          active.push(entry);
        }
      }
      index.auditCursor=(cursor+Math.max(1,Math.ceil(retained.length/10)))%retained.length;
    }
    // New/changed chats first, oldest verification samples afterward.
    return {work:active,auditIds,excluded:catalog.length-active.length,
      auditing:auditIds.size,reason:'recent-changes-and-bounded-audits'};
  }
  // The persisted checkpoint is the history high-water mark. Start at the
  // newest API page and stop as soon as its last saved message is observed.
  // No new API endpoint is needed; a fresh first page is required to see new
  // replies even when the shared page cache contains a recent result.
  function verifiedHistoryAnchor(history) {
    if (history?.complete !== true || !Array.isArray(history.messages) ||
        history.messages.length === 0) return '';
    const seen = new Set();
    for (const row of history.messages) {
      const id = typeof row?.id === 'string' ? row.id : String(row?.id || '');
      if (!id || seen.has(id)) return '';
      seen.add(id);
    }
    return String(history.messages.at(-1).id);
  }
  async function readHistory(entry, previous = null, fullAudit = false) {
    let lastId = '', pageSize = 100, first = true, complete = false, pages = 0;
    let expected = entry.expectedMessages, header = null;
    const originalAnchor = verifiedHistoryAnchor(previous);
    const anchor = fullAudit ? '' : originalAnchor;
    const byId = new Map(), seenCursors = new Set();
    let anchorFound = false;
    while (pages < 2000) {
      ensureNotCancelled();
      let res;
      try {
        res = await retry(() => (DS.fetchChatHistoryPageShared || DS.fetchChatHistoryPage)(
          entry.botId, entry.conversationId, {limit:pageSize,lastId,forceRefresh:first}), 'Chat history');
      } catch (error) {
        if (first && [400, 413, 422].includes(Number(error?.httpStatus || 0)) && pageSize > 50) {
          pageSize = 50; continue;
        }
        throw error;
      }
      const data = res?.data, rows = data?.messages;
      if (!Array.isArray(rows)) throw Error('Chat history returned no message array');
      if (first) {
        header = safeRaw(Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'messages')));
        expected = Number(data?.num_messages ?? expected) || expected;
        // An unexpectedly empty first page must not erase an existing backup.
        if (originalAnchor && rows.length === 0) throw Error('History API returned an empty page for a saved chat; existing checkpoint kept');
      }
      const parseStart = performance.now();
      for (let i = 0; i < rows.length; i++) {
        const message = rows[i];
        const id = String(message?.id || '');
        if (!id) throw Error('A message has no ID; cannot safely verify its order');
        const clean = safeRaw(message);
        if (byId.has(id)) {
          if (JSON.stringify(byId.get(id)) !== JSON.stringify(clean))
            throw Error('Conflicting message content under one ID');
        } else byId.set(id, clean);
        if (anchor && id === anchor) { anchorFound = true; break; }
        if (i && i % 25 === 0) await sleep(0);
      }
      addPhase('historyParsing', performance.now() - parseStart);
      pages++; first = false;
      if (anchorFound) { complete = true; break; }
      const oldest = rows.at(-1);
      if (!rows.length || (oldest && Object.hasOwn(oldest, 'prev_id') && !oldest.prev_id) || rows.length < pageSize) {
        complete = true; break;
      }
      const next = String(oldest?.id || '');
      if (!next || next === lastId || seenCursors.has(next)) throw Error('History pagination stopped advancing');
      seenCursors.add(next); lastId = next;
      await sleep(260);
    }
    if (!complete) throw Error('History exceeded safe page limit; saved checkpoint kept');
    const fetched = [...byId.values()].reverse(); // API pages are newest-first.
    const checkedAt = Date.now();
    if (anchorFound && previous) {
      // A matching newest message with the same native count needs no full
      // history copy, ID map or fresh ZIP chunks. Older edits still require Fresh.
      const newest = previous.messages.at(-1);
      if (fetched.length === 1 && String(fetched[0]?.id) === String(newest?.id) &&
          JSON.stringify(fetched[0]) === JSON.stringify(newest) &&
          (Number(expected) || null) === (Number(previous.expected) || null)) {
        return {...previous, header, lastCheckedAt:checkedAt,
          sync:{mode:'unchanged',checkedAt,fetchedPages:pages,added:0,updated:0,anchorFound:true}};
      }
      const oldIds = new Map(previous.messages.map((row, i) => [String(row.id), i]));
      const current = [...previous.messages];
      const added = [];
      let changedCount = 0;
      for (const message of fetched) {
        const index = oldIds.get(String(message.id));
        if (index === undefined) added.push(message);
        else if (JSON.stringify(current[index]) !== JSON.stringify(message)) {
          current[index] = message; changedCount++;
        }
      }
      current.push(...added);
      return {
        ...previous, messages: current, header, expected, complete: true, error: null,
        newestMessageId: String(current.at(-1)?.id || ''), lastCheckedAt: checkedAt,
        countWarning: expected && expected !== current.length ? `Listed ${expected}; API returned ${current.length}` : null,
        sync: { mode: 'catch-up', checkedAt, fetchedPages: pages,
          added: added.length, updated: changedCount, anchorFound: true }
      };
    }
    if (fullAudit && previous?.complete && Array.isArray(previous.messages) &&
        previous.messages.length===fetched.length &&
        (Number(expected)||null)===(Number(previous.expected)||null)) {
      let identical=true;
      for(let i=0;i<fetched.length;i++) {
        if (JSON.stringify(fetched[i])!==JSON.stringify(previous.messages[i])) {
          identical=false;break;
        }
        if (i%100===0) await sleep(0);
      }
      if (identical) return {...previous,header,lastCheckedAt:checkedAt,
        sync:{mode:'unchanged',checkedAt,fetchedPages:pages,added:0,updated:0,anchorFound:false,fullAudit:true}};
    }
    // The previously saved newest ID disappeared (deleted/regenerated) or
    // history was never completed. Finish the normal full read, never stitch
    // mismatched pagination chains together or silently mark an old history
    // as current. Preserve orphaned checkpoint records separately so nothing
    // saved locally is erased by a full reconciliation.
    const fetchedIds = originalAnchor && previous ? new Set(fetched.map(message => String(message.id))) : null;
    const orphaned = fetchedIds ? previous.messages.filter(message => !fetchedIds.has(String(message.id))) : [];
    const savedIds = originalAnchor && previous ? new Set(previous.messages.map(message => String(message.id))) : null;
    const savedOrphans = previous?.orphanedMessages || [];
    const orphanIds = new Set(fetched.map(message => String(message.id)));
    const orphanedMessages = [];
    for (const message of [...savedOrphans, ...orphaned]) {
      const id = String(message?.id || '');
      if (!id || orphanIds.has(id)) continue;
      orphanIds.add(id); orphanedMessages.push(message);
    }
    return {
      messages: fetched, header, pages, expected, complete: true,
      newestMessageId: String(fetched.at(-1)?.id || ''), lastCheckedAt: checkedAt,
      orphanedMessages, // not included in the current-history ZIP
      sync: {mode: fullAudit ? 'full-reconcile-audit' : originalAnchor ? 'full-reconcile-missing-anchor' : 'initial-full',
        checkedAt, fetchedPages: pages, added: savedIds ? fetched.filter(m => !savedIds.has(String(m.id))).length : fetched.length,
        updated: 0, anchorFound: !anchor},
      countWarning: expected && expected !== fetched.length ? `Listed ${expected}; API returned ${fetched.length}` : null,
      error: null
    };
  }
  // Skip packaging only when an older ZIP has been verified and every
  // required local checkpoint is still complete. This is not a freshness
  // guarantee for edits to older messages or native Memories.
  async function mayReuseVerifiedArchive(previous, entry, history, characterMode) {
    if (history?.sync?.mode !== 'unchanged' || previous?.state !== 'verified' ||
        !previous.lastVerifiedPart || !history.complete ||
        history.sync?.updated || history.sync?.added ||
        previous.history?.lastVerifiedMessageId !== history.newestMessageId ||
        memoryNeedsResume(previous.memory) || characterMode !== 'reuse' ||
        previous.entry?.botId !== entry.botId ||
        previous.entry?.conversationId !== entry.conversationId ||
        (Number(previous.entry?.expectedMessages) || null) !== (Number(entry.expectedMessages) || null) ||
        String(previous.entry?.botName || '') !== String(entry.botName || '')) return false;
    // Character/Lorebook snapshots have their own expiry and retry policy.
    // Don't hide a refresh just because the chat text itself is unchanged.
    const cached = await withStore('get', `__character_${entry.botId}`);
    const character = cached?.record;
    if (!character || character.schema !== 'ds-research-character-v1' ||
        character.fetchStatus !== 'present' || character.lastRefreshError ||
        Date.now() - Number(cached.at || 0) >= CHARACTER_CACHE_MS ||
        character.linkedLorebooks?.some(book => !book.paginationComplete ||
          ['restricted', 'fetch_failed'].includes(book.status))) return false;
    return true;
  }
  function wasLegacyCountOnlyMismatch(checkpoint) {
    // v0.2.83 originally called a fully paginated history incomplete when
    // native counts included deleted or regenerated messages. This marker is
    // narrow: never convert errors, API failures, or unfinished page chains.
    const history = checkpoint?.history;
    if (!history || history.complete !== false || !Array.isArray(history.messages) ||
        !Number.isInteger(history.pages) || history.pages < 1 || history.pages >= 2000) return false;
    const error = /^Expected (\d+), received (\d+)$/.exec(String(history.error || ''));
    if (!error) return false;
    const expected = Number(error[1]), retrieved = Number(error[2]);
    if (!Number.isSafeInteger(expected) || !Number.isSafeInteger(retrieved) ||
        expected <= retrieved || retrieved !== history.messages.length ||
        history.expected !== expected ||
        history.countWarning !== `Listed ${expected}; API returned ${retrieved}`) return false;
    return new Set(history.messages.map(message => String(message?.id || ''))).size === retrieved &&
      history.messages.every(message => message && message.id);
  }
  // Research Export read-only state index. SpicyChat already includes a
  // Rulebook HUD/initial state in some history response headers and per-turn
  // Rulebook state in some history messages. Preserve the raw messages above;
  // make these existing fields discoverable without guessing private endpoints.
  // This only runs inside a manually started Research Export, never on chats.
  function researchObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  function researchStorySources(entry, history) {
    const header = researchObject(history?.header) ? history.header : {};
    const row = researchObject(entry?.row) ? entry.row : {};
    const hud = researchObject(header.rulebook_hud) ? header.rulebook_hud :
      researchObject(row.rulebook_hud) ? row.rulebook_hud : null;
    const definition = researchObject(hud?.rulebook) ? hud.rulebook :
      researchObject(header.rulebook) ? header.rulebook :
      researchObject(row.rulebook) ? row.rulebook : null;
    const initialState = researchObject(hud?.initial_state) ? hud.initial_state :
      researchObject(header.rulebook?.initial_state) ? header.rulebook.initial_state : null;
    return {
      definition, initialState,
      definitionSource: researchObject(hud?.rulebook) ? 'history-api.rulebook_hud.rulebook' :
        researchObject(header.rulebook) ? 'history-api.rulebook' :
        researchObject(row.rulebook) ? 'conversation-list.rulebook' : 'not-exposed',
      initialStateSource: researchObject(hud?.initial_state) ? 'history-api.rulebook_hud.initial_state' :
        researchObject(header.rulebook?.initial_state) ? 'history-api.rulebook.initial_state' : 'not-exposed'
    };
  }
  function researchOocLines(message) {
    if (message?.role !== 'user' || typeof message.content !== 'string') return [];
    const matches = [];
    for (const line of message.content.split(/\r?\n/)) {
      const leading = /^\s*(\/cmd\b(?::|\s|$)|[[(]?\s*ooc\s*:)/i.exec(line);
      if (leading) {
        // Preserve the entire explicit line (up to the index safety cap); the
        // original untruncated message remains in messages-*.json.
        matches.push({format:/^\s*\/cmd\b/i.test(line) ? 'slash-cmd' : 'ooc-prefix',
          text:line.slice(0,16000),textTruncated:line.length>16000});
      } else {
        // Some mobile composers insert [OOC: ...] after normal roleplay text
        // on the same line. Count only explicitly delimited directives, never
        // ordinary prose merely mentioning the word OOC.
        const bracketed = /[[(]\s*ooc\s*:\s*([^\]\)]*)[\])]/gi;
        for (const match of line.matchAll(bracketed)) {
          matches.push({format:'ooc-inline-bracket',text:match[0].slice(0,16000),
            textTruncated:match[0].length>16000});
          if (matches.length>=128) break;
        }
      }
      if (matches.length>=128) break;
    }
    return matches;
  }
  async function collectResearchStoryData(entry, history) {
    const messages = Array.isArray(history?.messages) ? history.messages : [];
    const source = researchStorySources(entry, history);
    const perMessage = [], journalSnapshots = [], oocDirectives = [];
    const completeHistory = history?.complete === true && history?.sync?.mode !== 'catch-up-failed';
    const definition = source.definition ? safeRaw(source.definition) : null;
    const initialState = source.initialState ? safeRaw(source.initialState) : null;
    const meterDefinitions = Array.isArray(definition?.meters) ? definition.meters : [];
    const momentDefinition = meterDefinitions.find(m => m?.id === 'story-moments' ||
      (m?.journal === true && /story[ -]?moments?/i.test(String(m?.label || '')))) || null;
    let lastMessageId = null;
    for (let index = 0; index < messages.length; index++) {
      const message = messages[index];
      const messageId = String(message?.id || '');
      if (researchObject(message?.rulebook)) {
        // A snapshot is not necessarily a full, authoritative server state.
        // Store exactly what the history API exposed for the corresponding turn.
        const state = safeRaw(message.rulebook);
        perMessage.push({ messageId, messageNumber: index + 1,
          createdAt: message.createdAt || null, role: message.role || null, state });
        lastMessageId = messageId;
        const meters = researchObject(state.meters) ? state.meters : {};
        for (const [meterId, meter] of Object.entries(meters)) {
          if (meterId !== 'story-moments' && !(/story[ -]?moments?/i.test(meterId) && meter?.journal === true)) continue;
          journalSnapshots.push({ messageId, messageNumber: index + 1,
            createdAt: message.createdAt || null, meterId, state: safeRaw(meter),
            journalReceipts: Array.isArray(state.creator?.deltas) ?
              safeRaw(state.creator.deltas.flatMap(delta => delta?.meter_id === meterId &&
                Array.isArray(delta.journal_receipts) ? delta.journal_receipts : [])) : [] });
        }
      }
      for (const directive of researchOocLines(message)) {
        oocDirectives.push({messageId, messageNumber:index+1,
          createdAt:message.createdAt || null, source:'user-message-text', ...directive});
      }
      // Bound the main-thread work for long chats, keeping all output in ZIP.
      if (index && index % 200 === 0) { ensureNotCancelled(); await sleep(0); }
    }
    const rulebookStatus = definition || initialState || perMessage.length ? 'present' : 'not-exposed';
    const storyStatus = momentDefinition || researchObject(initialState?.meters?.['story-moments']) || journalSnapshots.length
      ? 'present' : 'not-exposed';
    return {
      rulebook: { schema:'ds-research-rulebook-states-v1',conversationId:entry.conversationId,
        status:rulebookStatus,definitionStatus:definition ? 'present':'not-exposed',
        definitionSource:source.definitionSource,definition,
        initialStateStatus:initialState ? 'present':'not-exposed',
        initialStateSource:source.initialStateSource,initialState,
        messageStateStatus:perMessage.length ? 'present':'not-exposed',
        messageStateCount:perMessage.length,latestObservedMessageId:lastMessageId,
        perMessage,
        historyComplete:completeHistory,
        coverage:'Only Rulebook metadata and snapshots exposed in the conversation/history API. No separate private Rulebook endpoint or reconstructed state.' },
      moments: { schema:'ds-research-story-moments-v1',conversationId:entry.conversationId,
        status:storyStatus,definition:momentDefinition ? safeRaw(momentDefinition):null,
        initialState:initialState?.meters?.['story-moments'] || null,
        snapshots:journalSnapshots,observedSnapshots:journalSnapshots.length,
        historyComplete:completeHistory,
        coverage:'Journal snapshots embedded in API messages; missing events are unknown, not proof that no moments occurred.' },
      ooc: { schema:'ds-research-ooc-directives-v1',conversationId:entry.conversationId,
        status:oocDirectives.length ? 'found' : completeHistory ? 'no-explicit-directives-found':'history-unavailable-or-stale',
        source:'explicit-user-message-text',directives:oocDirectives,found:oocDirectives.length,
        historyComplete:completeHistory,
        coverage:'Only user message lines explicitly starting with /cmd or OOC:. Native hidden directives and QoL saved templates are not inferred. Full original messages remain in messages-*.json.' }
    };
  }
  // SpicyChat Memory Manager V2 loads 50 Memories per page. The native
  // "Load More Memories" control passes the last Memory's full ID as last_id.
  // Old checkpoints with exactly 50 items cannot be considered complete.
  const MEMORY_PAGE_SIZE = 50, MAX_MEMORY_PAGES = 1000;
  const memoryUuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  function validMemoryCursor(id, conversationId) {
    return typeof id === 'string' && id.startsWith(conversationId + '.') &&
      memoryUuid.test(id.slice(conversationId.length + 1));
  }
  function memoryNeedsResume(memory) {
    if (!memory || memory.status === 'unavailable') return true;
    if (!['retrieved','empty-confirmed'].includes(memory.status)) return true;
    if (memory.paginationComplete === true) return false;
    // A legacy single-page result of 50 is ambiguous, even if verified.
    return Array.isArray(memory.items) && memory.items.length >= MEMORY_PAGE_SIZE;
  }
  async function readMemories(entry, previous = null, onPage = null) {
    const items = Array.isArray(previous?.items) ? safeRaw(previous.items) : [];
    const seen = new Set(items.map(item => String(item?.id || '')));
    let pages = Number.isInteger(previous?.pages) ? previous.pages :
      (items.length ? Math.ceil(items.length / MEMORY_PAGE_SIZE) : 0);
    let cursor = String(previous?.nextCursor || (items.length ? items.at(-1)?.id : '') || '').toLowerCase();
    const failure = (reason,httpStatus=null) => ({status:'unavailable',reason,httpStatus,
      items,pages,paginationComplete:false,nextCursor:cursor});
    if (cursor && !validMemoryCursor(cursor,entry.conversationId))
      return failure('invalid-memory-cursor');
    const cursors = new Set();
    while (pages < MAX_MEMORY_PAGES) {
      ensureNotCancelled();
      let response = null;
      for (let n = 0; n < 3; n++) {
        ensureNotCancelled();
        response = await DS.researchReadConversationMemories?.(entry.conversationId,runId,cursor);
        if (response?.ok || n === 2 || !['timeout','network-error','rate-limited',
            'http-failed','request-error','rate-paced','already-reading'].includes(response?.status)) break;
        await sleep(Math.max(1000, Math.min(12000, Number(response?.retryAfterMs) || (n + 1) * 1500)));
      }
      if (response?.status==='export-route-changed')
        throw Error('Research Export tab navigated away from /chats; stopped safely. Reopen the exporter and Resume.');
      if (!response?.ok) return failure(response?.status || 'memory-api-not-confirmed',response?.httpStatus || null);
      if (response.conversationId !== entry.conversationId || !Array.isArray(response.memories))
        return failure('unexpected-memory-response');
      const parseStart = performance.now();
      const page = safeRaw(response.memories);
      addPhase('memoryParsing', performance.now() - parseStart);
      pages++;
      let added = 0;
      for (const memory of page) {
        const id = String(memory?.id || '');
        if (!validMemoryCursor(id,entry.conversationId)) return failure('invalid-memory-id');
        if (!seen.has(id)) {seen.add(id);items.push(memory);added++;}
      }
      if (page.length && !added) return failure('repeated-memory-page');
      if (page.length < MEMORY_PAGE_SIZE) return {
        status:items.length?'retrieved':'empty-confirmed',items,pages,paginationComplete:true,nextCursor:null};
      const next = String(page.at(-1)?.id || '').toLowerCase();
      if (!validMemoryCursor(next,entry.conversationId) || next===cursor || cursors.has(next))
        return failure('repeated-memory-cursor');
      cursors.add(next);cursor=next;
      // Save progress after EACH full page, so cancellation or an API problem
      // never loses previously downloaded older Memories.
      if (onPage) await onPage(failure('memory-pagination-pending'));
      update(`Loading older Memories · ${entry.botName || entry.conversationId} · ${items.length} saved (${pages} pages)...`);
      await sleep(350); // Existing MAIN-world guard requires at least 300ms.
    }
    return failure('memory-page-safety-limit');
  }
  // Character snapshots are optional API reads that run ONLY during a manual
  // Research Export. One indexed checkpoint and one JSON file per bot; many
  // conversations can reference it without duplicating character definitions.
  const CHARACTER_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
  // Do not preserve failed API snapshots forever. A transient outage can be
  // retried after 12h; successful snapshots still retain the 7-day window.
  const CHARACTER_FAILED_CACHE_MS = 12 * 60 * 60 * 1000;
  // A 200 with no usable character record is not the same as a transient
  // network failure. Cache it for a normal week; manual Retry overrides it.
  const CHARACTER_EMPTY_RECORD_CACHE_MS = CHARACTER_CACHE_MS;
  let characterReadCircuit = null, lorebookReadCircuit = null;
  // One run may reference the same public Lorebook from many bots. Keep a
  // small, run-scoped read-through cache; never retain it after export ends.
  const linkedLorebookRunCache = new Map();
  const MAX_LINKED_LOREBOOK_CACHE = 8;
  const CHARACTER_FIELD_ALIASES = Object.freeze({
    botId: ['id','uuid','character_id','characterId'],
    name: ['name','character_name','characterName'],
    publicTitle: ['title','tagline','subtitle','public_title','publicTitle'],
    creator: ['creator_username','creatorUsername','creator','creator_name','creatorName'],
    visibility: ['visibility','privacy','publish_status','publishStatus'],
    createdAt: ['createdAt','created_at','created'],
    updatedAt: ['updatedAt','updated_at','modifiedAt','modified_at'],
    description: ['description','public_description','publicDescription'],
    introduction: ['introduction','intro','backstory','introduction_text'],
    greeting: ['greeting','first_mes','first_message','firstMessage','initial_message'],
    alternateGreetings: ['alternate_greetings','alternateGreetings','greetings','alternate_messages','alternateMessages'],
    personality: ['personality','persona','character_personality'],
    characterDefinition: ['definition','character_definition','characterDefinition','system_prompt','systemPrompt'],
    scenario: ['scenario','world_scenario','worldScenario'],
    exampleDialogue: ['mes_example','example_dialogue','exampleDialogue','example_dialogues','exampleDialogues','examples','dialogue','dialogue_examples','dialogueExamples'],
    officialTags: ['tags','tag_list','tagList','character_tags','characterTags','categories','tag_names','tagNames'],
    officialTagIds: ['tag_ids','tagIds','character_tag_ids','characterTagIds'],
    linkedLorebooks: ['lorebooks','lorebook_ids','lorebookIds','lorebook_id','lorebookId','lorebook'],
    linkedRulebooks: ['rulebooks','rulebook_ids','rulebookIds','rulebook_id','rulebookId','rulebook']
  });
  const CHARACTER_FIELD_NAMES = Object.keys(CHARACTER_FIELD_ALIASES).concat('profileUrl');
  const characterFile = botId => `characters/${botId}.json`;
  function sourceValue(sources, aliases) {
    let explicitEmpty = null;
    for (const [source, name] of sources) {
      if (!source || typeof source !== 'object') continue;
      for (const key of aliases) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        const value = source[key];
        if (value === null || value === undefined) continue; // null is NOT evidence of an empty field
        const candidate={present:true,value:safeRaw(value),source:name,sourceKey:key};
        if (statusOf(value)==='present') return candidate;
        if (!explicitEmpty) explicitEmpty=candidate;
      }
    }
    return explicitEmpty || {present:false};
  }
  function statusOf(value) {
    return value === '' || (Array.isArray(value) && value.length === 0) ||
      (value && typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length)
      ? 'empty' : 'present';
  }
  function fieldOf(value, unavailable = 'not_exposed') {
    return value.present ? {status:statusOf(value.value),value:value.value,source:value.source,sourceKey:value.sourceKey} : {status:unavailable};
  }
  function referencedIds(field) {
    if (!field || !['present','empty'].includes(field.status)) return [];
    const ids = new Set();
    const add = item => {
      if (typeof item === 'string' && UUID.test(item)) ids.add(item.toLowerCase());
      else if (item && typeof item === 'object' && !Array.isArray(item)) {
        for (const key of ['id','uuid','lorebook_id','lorebookId','rulebook_id','rulebookId']) {
          if (typeof item[key] === 'string' && UUID.test(item[key])) ids.add(item[key].toLowerCase());
        }
      }
    };
    if (Array.isArray(field.value)) field.value.forEach(add);
    else add(field.value);
    return [...ids];
  }
  function seedSources(seed) {
    // Conversation list snapshots are legitimate current-user-visible data;
    // never mistake a conversation title for the character's public title.
    return [[seed?.row?.character, 'conversation-list-character'], [seed?.row, 'conversation-list']];
  }
  function makeCharacterSnapshot(seed, api) {
    const at = new Date().toISOString();
    const record = api?.ok ? safeRaw(api.record) : null;
    const sources = record ? [[record,'character-api'], [record?.character,'character-api-nested'],
      [record?.data?.character,'character-api-data-nested'], ...seedSources(seed)] : seedSources(seed);
    const unavailable = api?.ok ? 'not_exposed' : (api?.status === 'restricted' ? 'restricted' : 'fetch_failed');
    const fields = {};
    for (const [key, aliases] of Object.entries(CHARACTER_FIELD_ALIASES)) {
      // A conversation's embedded character object is legitimate visible
      // metadata too. The outer conversation row's title is NOT a bot title.
      const availableSources = sources.filter(([,_source]) => _source !== 'conversation-list' ||
        ['botId','name','creator','createdAt','updatedAt'].includes(key));
      fields[key] = fieldOf(sourceValue(availableSources, aliases), unavailable);
    }
    // Known bot ID and profile URL are derived from a verified conversation's
    // bot ID, not guesses about any unexposed character data.
    fields.botId = {status:'present',value:seed.botId,source:'verified-conversation-id'};
    fields.profileUrl = {status:'present',value:`https://spicychat.ai/chatbot/${seed.botId}`,source:'verified-conversation-id'};
    if (fields.name.status !== 'present' && seed.botName)
      fields.name = {status:'present',value:seed.botName,source:'conversation-list'};
    const lorebookIds = referencedIds(fields.linkedLorebooks);
    const rulebookIds = referencedIds(fields.linkedRulebooks);
    const tags = fields.officialTags.status === 'present' ? fields.officialTags.value : null;
    const result = {schema:'ds-research-character-v1',botId:seed.botId,profileUrl:fields.profileUrl.value,
      fetchedAt:at,source:api?.ok ? String(api.source || 'character-api') : 'conversation-list-only',
      fetchStatus:api?.ok ? 'present' : unavailable,httpStatus:api?.httpStatus || null,
      fetchError:api?.ok ? null : String(api?.reason || 'Character API unavailable').slice(0,260),
      fields,officialTagsRaw:tags,linkedLorebookIds:lorebookIds,linkedRulebookIds:rulebookIds,
      linkedLorebooks:[],linkedRulebooks:[],
      // The API response is from the currently authenticated user. All
      // exposed character fields remain verbatim except credential-like keys
      // scrubbed recursively by safeRaw; no editor/profile scraping.
      exposedCharacterData:record,
      exposedConversationCharacterData:seed?.row?.character ? safeRaw(seed.row.character) : null,
      completeness:null};
    // Preserve the raw embedded Rulebook if exposed; a mere UUID proves only
    // association, NOT access to its content. No speculative Rulebook endpoint.
    if (fields.linkedRulebooks.status === 'present') {
      const raw = fields.linkedRulebooks.value;
      const candidates = Array.isArray(raw) ? raw : [raw];
      result.linkedRulebooks = candidates.map(value => ({id:referencedIds({status:'present',value})[0]||null,
        status:value && typeof value === 'object' && Object.keys(value).some(k=>!['id','uuid'].includes(k)) ? 'present' : 'not_exposed',
        source:'character-api',metadata:value,contentStatus:
          value && typeof value === 'object' && ['content','entries','rules','instructions','definition'].some(k=>Object.hasOwn(value,k)) ? 'present' : 'not_exposed'}));
    }
    return result;
  }
  function lorebookPayload(value) {
    const data = value?.data && typeof value.data === 'object' ? value.data : value;
    const book = data?.lorebook || value?.lorebook || data;
    if (!book || typeof book !== 'object') return null;
    return {...book,entries:book.entries ?? data?.entries ?? value?.entries ??
      book.lorebook_entries ?? data?.lorebook_entries ?? book.lorebookEntries ?? data?.lorebookEntries};
  }
  async function collectLinkedLorebook(id) {
    const result = {id,status:'not_exposed',source:'spicychat-lorebook-live-api',fetchedAt:new Date().toISOString(),
      pages:0,paginationComplete:false,paginationStopReason:null,expectedEntries:null,entries:[],metadata:null,error:null};
    if (typeof DS.fetchLorebookArchiveData !== 'function') return result;
    let cursor = 0;
    const seenIds = new Set(), cursors = new Set();
    try {
      for (let page=0;page<120;page++) {
        ensureNotCancelled();
        const response = await DS.fetchLorebookArchiveData(id,false,{lastSortPriority:cursor});
        const book = lorebookPayload(response?.data);
        if (!book) throw Error('No readable Lorebook payload');
        const returned = String(book.id || book.uuid || book.lorebook_id || book.lorebookId || '').toLowerCase();
        if (returned && returned !== id) throw Error('Lorebook ID mismatch');
        const rows = book.entries;
        if (!Array.isArray(rows)) {result.status='not_exposed';result.metadata=safeRaw(Object.fromEntries(Object.entries(book).filter(([k])=>k!=='entries')));break;}
        result.pages++;
        if (!result.metadata) result.metadata=safeRaw(Object.fromEntries(Object.entries(book).filter(([k])=>k!=='entries')));
        const expected = Number(book.num_entries ?? book.numEntries ?? book.entries_count ?? book.entriesCount);
        if (Number.isSafeInteger(expected) && expected >= 0) result.expectedEntries=expected;
        let added=0;
        for (const item of rows) {
          const key = String(item?.id || item?.uuid || JSON.stringify(item));
          if (!key || seenIds.has(key))continue;
          seenIds.add(key);result.entries.push(safeRaw(item));added++;
        }
        if (result.expectedEntries !== null && result.entries.length >= result.expectedEntries) {result.paginationComplete=true;break;}
        if (!rows.length || (!added && page>0)) {
          if (result.expectedEntries !== null && result.entries.length < result.expectedEntries)
            result.paginationStopReason = !rows.length ? 'early-empty-page' : 'repeated-page-no-new-entries';
          // A short page is not always sufficient evidence of completeness
          // when an explicit total says there are older pages.
          result.paginationComplete = result.expectedEntries === null || result.entries.length >= result.expectedEntries;
          break;
        }
        if (result.expectedEntries === null && rows.length < 100) {result.paginationComplete=true;break;}
        const last=rows.at(-1);
        const priority=last?.priority ?? last?.sortPriority ?? last?.sort_priority;
        const next=(priority === null || priority === undefined || priority === '') ? NaN : Number(priority);
        if (!Number.isFinite(next) || next===cursor || cursors.has(next)) {
          result.paginationStopReason = !Number.isFinite(next) ? 'no-usable-priority-cursor' : 'repeated-priority-cursor';
          break;
        }
        cursors.add(next);cursor=next;
        await sleep(350);
      }
      result.status=result.entries.length ? 'present' : result.paginationComplete ? 'empty' : result.status;
      if (!result.paginationComplete && result.status !== 'not_exposed') {
        result.paginationStopReason ||= 'page-safety-limit-or-early-stop';
        result.error = `Lorebook pagination incomplete (${result.paginationStopReason})`;
      }
    } catch (error) {
      if (cancelled) throw error;
      const http=Number(error?.httpStatus || String(error?.message||'').match(/HTTP\s+(\d{3})/i)?.[1] || 0);
      result.status=[401,403].includes(http)?'restricted':'fetch_failed';
      result.httpStatus=http||null;result.error=String(error?.message||error).slice(0,240);
    }
    return result;
  }
  async function readLinkedLorebook(id) {
    if (linkedLorebookRunCache.has(id)) return linkedLorebookRunCache.get(id);
    const result=await collectLinkedLorebook(id);
    if (['present','empty'].includes(result.status) && Array.isArray(result.entries) &&
        result.entries.length<=100) {
      if (linkedLorebookRunCache.size>=MAX_LINKED_LOREBOOK_CACHE)
        linkedLorebookRunCache.delete(linkedLorebookRunCache.keys().next().value);
      linkedLorebookRunCache.set(id,result);
    }
    return result;
  }
  function repairCachedCharacterFields(record) {
    // Earlier exports retained raw API `dialogue` but accidentally marked
    // exampleDialogue not_exposed. A checkpoint can be repaired without GETs.
    if (!record || record.schema!=='ds-research-character-v1') return false;
    const old=record.fields?.exampleDialogue;
    if (!old || !['not_exposed','fetch_failed'].includes(old.status)) return false;
    const candidate=sourceValue([
      [record.exposedCharacterData,'character-api'],
      [record.exposedCharacterData?.character,'character-api-nested'],
      [record.exposedConversationCharacterData,'conversation-list-character']
    ],CHARACTER_FIELD_ALIASES.exampleDialogue);
    if (!candidate.present) return false;
    record.fields.exampleDialogue=fieldOf(candidate);
    record.normalizedAt=new Date().toISOString();
    finishCharacterCompleteness(record);
    return true;
  }
  function finishCharacterCompleteness(record) {
    const statuses={};
    for (const field of Object.values(record.fields)) statuses[field.status]=(statuses[field.status]||0)+1;
    const errors=[];
    if (record.fetchError) errors.push({scope:'character',status:record.fetchStatus,reason:record.fetchError});
    for (const book of record.linkedLorebooks||[]) if (book.error)
      errors.push({scope:'lorebook',id:book.id,status:book.status,reason:book.error});
    record.completeness={fieldStatuses:statuses,fieldCount:CHARACTER_FIELD_NAMES.length,
      exposedFields:(statuses.present||0)+(statuses.empty||0),
      lorebooksDiscovered:record.linkedLorebookIds?.length||0,
      lorebooksComplete:(record.linkedLorebooks||[]).filter(b=>b.paginationComplete).length,
      rulebookContentAvailable:(record.linkedRulebooks||[]).filter(b=>b.contentStatus==='present').length,
      errors};
    return record;
  }
  async function readCharacter(seed, mode) {
    const key=`__character_${seed.botId}`;
    const cached=await withStore('get',key);
    const age=Date.now()-Number(cached?.at||0);
    const valid=cached?.record?.schema==='ds-research-character-v1';
    if (valid && repairCachedCharacterFields(cached.record)) {
      await withStore('put',cached);
    }
    const staleIncomplete = mode==='reuse' && age >= CHARACTER_FAILED_CACHE_MS &&
      cached?.record?.fetchStatus === 'present' &&
      cached?.record?.linkedLorebooks?.some(b => ['restricted','fetch_failed'].includes(b.status) ||
        (b.status === 'present' && b.paginationComplete === false));
    const retry = (mode==='retry-failed' || staleIncomplete) && (cached?.record?.lastRefreshError||cached?.record?.fetchStatus==='fetch_failed'||cached?.record?.fetchStatus==='restricted'||
      cached?.record?.linkedLorebooks?.some(b=>['restricted','fetch_failed'].includes(b.status) ||
        (b.status==='present' && b.paginationComplete===false)));
    const failureCacheMs = cached?.record?.fetchError === 'character-api-empty-record' &&
      cached?.record?.httpStatus === 200 ? CHARACTER_EMPTY_RECORD_CACHE_MS : CHARACTER_FAILED_CACHE_MS;
    if (valid && mode!=='refresh' && !retry &&
        age < (cached.record.fetchStatus === 'present' ? CHARACTER_CACHE_MS : failureCacheMs))
      return cached.record;
    if (valid && (mode==='retry-failed' || staleIncomplete) && cached.record.fetchStatus==='present' && !cached.record.lastRefreshError) {
      // A Lorebook-only retry should NOT refetch the character profile.
      const changed=safeRaw(cached.record);
      for (let i=0;i<changed.linkedLorebooks.length;i++) {
        const old=changed.linkedLorebooks[i];
        if (!['restricted','fetch_failed'].includes(old.status) && !(old.status==='present' && old.paginationComplete===false))continue;
        ensureNotCancelled();
        if (lorebookReadCircuit) break;
        const next=await measure('linkedLorebookRead',()=>readLinkedLorebook(old.id));
        changed.linkedLorebooks[i]=next;
        if (next.httpStatus===429 || next.httpStatus===401)lorebookReadCircuit={reason:next.error||'Lorebook API blocked'};
        await sleep(350);
      }
      finishCharacterCompleteness(changed);
      await withStore('put',{conversationId:key,record:changed,at:Date.now(),state:'complete'});
      return changed;
    }
    update(`Reading character metadata · ${seed.botName || seed.botId}`);
    const api = characterReadCircuit
      ? {ok:false,status:'fetch_failed',reason:`Character API skipped after ${characterReadCircuit.reason}`,httpStatus:characterReadCircuit.httpStatus}
      : typeof DS.fetchResearchCharacterMetadata==='function'
        ? await DS.fetchResearchCharacterMetadata(seed.botId)
        : {ok:false,status:'fetch_failed',reason:'Character API reader not loaded'};
    if (!api.ok && (api.httpStatus===429 || api.httpStatus===401 ||
        /auth(?:entication)?[^.;]{0,35}(?:unavailable|not ready)|rate.limit/i.test(String(api.reason||''))))
      characterReadCircuit={reason:String(api.reason||'auth/rate limited').slice(0,120),httpStatus:api.httpStatus||0};
    ensureNotCancelled();
    const record=makeCharacterSnapshot(seed,api);
    // Preserve a previously successful snapshot if a refresh hits an outage.
    // The new failure is still recorded, never disguised as a fresh result.
    if (!api.ok && valid && cached.record.fetchStatus==='present') {
      const preserved=safeRaw(cached.record);
      preserved.lastRefreshError={status:api.status||'fetch_failed',httpStatus:api.httpStatus||null,
        reason:String(api.reason||'API refresh failed').slice(0,240),attemptedAt:new Date().toISOString()};
      await withStore('put',{conversationId:key,record:preserved,at:Date.now(),state:'stale-retained'});
      return preserved;
    }
    for (const id of record.linkedLorebookIds) {
      ensureNotCancelled();
      // Existing cached Lorebook content is reusable even during an explicit
      // failed-field retry; refresh-all intentionally re-reads it.
      const old = cached?.record?.linkedLorebooks?.find(b=>b.id===id);
      const useOld = old && mode!=='refresh' && old.paginationComplete &&
        !['restricted','fetch_failed'].includes(old.status) && age < CHARACTER_CACHE_MS;
      const book = useOld ? old : lorebookReadCircuit
        ? {id,status:'fetch_failed',source:'lorebook-api',fetchedAt:new Date().toISOString(),
          entries:[],paginationComplete:false,error:`Skipped after ${lorebookReadCircuit.reason}`}
        : await measure('linkedLorebookRead',()=>readLinkedLorebook(id));
      record.linkedLorebooks.push(book);
      if (!useOld && (book.httpStatus===429 || book.httpStatus===401 || /auth unavailable|rate.limit/i.test(String(book.error||''))))
        lorebookReadCircuit={reason:String(book.error||'auth/rate limited').slice(0,120)};
      await sleep(350);
    }
    finishCharacterCompleteness(record);
    await withStore('put',{conversationId:key,record,at:Date.now(),state:'complete'});
    return record;
  }

  // Cooperative legacy path, used only if the browser blocks worker creation.
  const crcTable = Array.from({length:256}, (_,n) => { let c=n; for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0; });
  async function crc32Yield(bytes) {
    let c=0xffffffff;
    const start = performance.now();
    for (let i=0; i<bytes.length; i+=65536) {
      const stop=Math.min(i+65536,bytes.length);
      for (let j=i;j<stop;j++) c=crcTable[(c^bytes[j])&255]^(c>>>8);
      if (stop<bytes.length) {ensureNotCancelled(); await sleep(0);}
    }
    addPhase('crc32', performance.now() - start);
    return (c^0xffffffff)>>>0;
  }
  const u16=(v,o,n)=>v.setUint16(o,n&65535,true), u32=(v,o,n)=>v.setUint32(o,n>>>0,true);
  async function packSerializedFallback(name, json) {
    const start=performance.now(), original=encoder.encode(json),nameBytes=encoder.encode(name);
    addPhase('encoding',performance.now()-start);
    if(original.length>32*1024*1024)throw Error('A single JSON chunk exceeds 32 MB; reduce message chunk size');
    let data=original,method=0;
    if(typeof CompressionStream==='function'){
      const compressionStart=performance.now();
      try{
        const stream=new Blob([original]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        const compressed=new Uint8Array(await new Response(stream).arrayBuffer());
        if(compressed.length<original.length){data=compressed;method=8;}
      }catch{} // Keep a valid stored ZIP entry if compression is unavailable.
      addPhase('compression',performance.now()-compressionStart);
    }
    return {name,nameBytes,data,size:original.length,crc:await crc32Yield(original),method};
  }
  async function zippedEntry(name,object){
    const packed=await callArchiveWorker('pack-json',{name,object});
    if(packed){addWorkerMetrics(packed.metrics);return packed.entry;}
    const start=performance.now(),serialized=JSON.stringify(object);
    addPhase('serialization',performance.now()-start);
    return packSerializedFallback(name,serialized);
  }
  async function zippedMessages(conversationId,messages,firstIndex){
    const packed=await callArchiveWorker('pack-messages',{conversationId,messages,chunkIndex:firstIndex});
    if(packed){addWorkerMetrics(packed.metrics);return packed;}
    const result=[],prefix=`{"conversationId":${JSON.stringify(conversationId)},"order":"oldest-first","messages":[`;
    let chunk=[],bytes=0,index=firstIndex;
    const finish=async()=>{
      if(!chunk.length && messages.length)return;
      const name=`conversations/${conversationId}/messages-${String(index++).padStart(4,'0')}.json`;
      result.push(await packSerializedFallback(name,prefix+chunk.join(',')+']}'));
      chunk=[];bytes=0;
    };
    for(let i=0;i<messages.length;i++){
      const start=performance.now(),json=JSON.stringify(messages[i]);
      addPhase('serialization',performance.now()-start);
      chunk.push(json);bytes+=encoder.encode(json).length;
      if(chunk.length>=150||bytes>=2_000_000)await finish();
      if(i && i%8===0){ensureNotCancelled();await sleep(0);}
    }
    if(chunk.length||!messages.length)await finish();
    return {entries:result,nextChunkIndex:index};
  }
  async function buildZipFallback(entries){
    if(entries.length>65534)throw Error('Too many files for this ZIP part');
    const start=performance.now(),parts=[],central=[];
    let offset=0,centralSize=0;
    const date=new Date(),y=Math.max(1980,date.getFullYear());
    const dt=((y-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
    const tm=(date.getHours()<<11)|(date.getMinutes()<<5)|Math.floor(date.getSeconds()/2);
    for(let i=0;i<entries.length;i++){
      const e=entries[i],n=e.nameBytes.length,l=new Uint8Array(30+n),v=new DataView(l.buffer);
      u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0x800);u16(v,8,e.method);u16(v,10,tm);u16(v,12,dt);
      u32(v,14,e.crc);u32(v,18,e.data.length);u32(v,22,e.size);u16(v,26,n);l.set(e.nameBytes,30);
      parts.push(l,e.data);
      const c=new Uint8Array(46+n),w=new DataView(c.buffer);
      u32(w,0,0x02014b50);u16(w,4,20);u16(w,6,20);u16(w,8,0x800);u16(w,10,e.method);u16(w,12,tm);u16(w,14,dt);
      u32(w,16,e.crc);u32(w,20,e.data.length);u32(w,24,e.size);u16(w,28,n);u32(w,42,offset);c.set(e.nameBytes,46);
      central.push(c);offset+=l.length+e.data.length;centralSize+=c.length;
      if(i && i%16===0){ensureNotCancelled();await sleep(0);}
    }
    const end=new Uint8Array(22),e=new DataView(end.buffer);
    u32(e,0,0x06054b50);u16(e,8,entries.length);u16(e,10,entries.length);u32(e,12,centralSize);u32(e,16,offset);
    const blob=new Blob([...parts,...central,end],{type:'application/zip'});
    if(blob.size>MAX_ZIP_BYTES)throw Error('ZIP part exceeded 300 MB');
    addPhase('zipAssembly',performance.now()-start);
    return blob;
  }
  async function archiveBlob(entries,partNumber,report){
    // First check worker availability. If active, transfer the packed byte arrays
    // rather than blocking the page with a large structured-clone copy.
    if(await startArchiveWorker()){
      ensureNotCancelled();
      const transfers=entries.flatMap(e=>[e.nameBytes.buffer,e.data.buffer]);
      const result=await callArchiveWorker('build-zip',{entries,partNumber,report},transfers);
      if(!result)throw Error('Archive worker stopped while assembling a ZIP; Resume will rebuild from checkpoints');
      addWorkerMetrics(result.metrics);
      return result.blob;
    }
    const manifest={format:'ds-chat-memory-character-research-v2',generatedAt:new Date().toISOString(),
      part:partNumber,selection:{botLimit:report.botSelection},safetyLimits:{compressedBytesPerPart:MAX_ZIP_BYTES},
      summary:report,files:entries.map(e=>({path:e.name,bytes:e.size,compressedBytes:e.data.length,crc32:e.crc}))};
    return buildZipFallback([await zippedEntry('manifest.json',manifest),...entries]);
  }
  function verifyRequest(filename,expectedBytes,after) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({type:'DS_RESEARCH_VERIFY_DOWNLOAD',filename,expectedBytes,after}, response =>
        resolve(chrome.runtime.lastError ? {ok:false,status:'extension-error'} : response || {ok:false,status:'no-response'}));
    });
  }
  async function downloadPart(entries, partNumber, report) {
    const blob=await measure('zipAssemblyTotal',()=>archiveBlob(entries,partNumber,report));
    const filename=`spicychat-research-${runId}-part-${String(partNumber).padStart(3,'0')}.zip`;
    const after=Date.now();
    // Measure only the synchronous main-thread dispatch separately. The ZIP
    // worker and permission/download verification waits are not CPU time.
    const dispatchStart=performance.now();
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.download=filename;a.href=url;a.style.display='none';document.body.append(a);
    try { a.click(); } finally { a.remove(); }
    const dispatchMs=performance.now()-dispatchStart;
    addPhase('downloadDispatchSync',dispatchMs);
    phaseAttribution('downloadDispatchSync',dispatchMs);
    let result={ok:false,status:'download-not-found'};
    for (let i=0;i<40;i++) {
      await sleep(1000);result=await measure('downloadVerification',()=>verifyRequest(filename,blob.size,after));
      if (result.ok || ['size-mismatch','download-verification-unavailable','downloads-permission-unavailable'].includes(result.status)) break;
    }
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    if (!result.ok) throw Error(`Part ${partNumber} download not verified (${result.status}). Check Downloads; the checkpoint remains resumable.`);
    return {filename,bytes:blob.size};
  }
  // GitHub uploads run only after every Research Export ZIP part was
  // verified. It reads already saved checkpoints, never sends new API calls,
  // and does not affect the existing ZIP worker, cancellation or checkpoints.
  // Build the staging payload in bounded pieces rather than stringifying an
  // entire long chat on the foreground thread in one blocking call. Output is
  // ordinary JSON, with the same record structure and 110k staging contract.
  async function researchStagingChunks(key, record) {
    const chunkSize = 110000, maxChars = 79_000_000;
    const payload = {schema:'dsq-research-record-v1',key,complete:true,...record};
    const chunks = [], ancestors = new Set();
    const stack = [{kind:'value',value:payload}];
    let current = '', length = 0, processed = 0, lastYieldLength = 0;
    function append(part) {
      length += part.length;
      if (length > maxChars) throw Error('Verified research record exceeds safe GitHub staging limit');
      for (let offset=0; offset<part.length;) {
        const count = Math.min(chunkSize-current.length, part.length-offset);
        current += part.slice(offset,offset+count);
        offset += count;
        if (current.length === chunkSize) {chunks.push(current);current='';}
      }
    }
    while (stack.length) {
      ensureNotCancelled();
      const node = stack.pop();
      if (node.kind === 'text') append(node.text);
      else if (node.kind === 'end') {
        append(node.text);
        ancestors.delete(node.value);
      } else {
        const value = node.value;
        if (value && typeof value === 'object' && typeof value.toJSON !== 'function') {
          if (ancestors.has(value)) throw Error('Cannot stage a circular Research Export record');
          ancestors.add(value);
          const isArray = Array.isArray(value);
          const entries = isArray ? value : Object.entries(value).filter(([,item]) =>
            item !== undefined && typeof item !== 'function' && typeof item !== 'symbol');
          append(isArray ? '[' : '{');
          stack.push({kind:'end',text:isArray ? ']' : '}',value});
          for (let i=entries.length-1;i>=0;i--) {
            if (isArray) stack.push({kind:'value',value:entries[i]});
            else {
              stack.push({kind:'value',value:entries[i][1]});
              stack.push({kind:'text',text:':'});
              stack.push({kind:'text',text:JSON.stringify(entries[i][0])});
            }
            if (i) stack.push({kind:'text',text:','});
          }
        } else {
          const json = JSON.stringify(value);
          append(json === undefined ? 'null' : json);
        }
      }
      // Give Cancel and browser paints a turn during a large Research record.
      if (++processed >= 250 || length-lastYieldLength >= 48_000) {
        processed=0;lastYieldLength=length;
        await sleep(0);
      }
    }
    if (current) chunks.push(current);
    if (chunks.length > 1000) throw Error('Too many Research Export staging chunks');
    return chunks;
  }
  async function githubResearchStageRecord(key,record,runToken) {
    ensureNotCancelled();
    const start = performance.now();
    const chunks = await researchStagingChunks(key,record);
    addPhase('githubResearchSerialization',performance.now()-start);
    const total=chunks.length;
    for(let i=0;i<total;i++){
      ensureNotCancelled();
      const response=await new Promise(resolve=>chrome.runtime.sendMessage({
        type:'DS_GITHUB_BACKUP_RESEARCH_STAGE',recordKey:key,job:runToken,
        part:i,total,data:chunks[i]
      },r=>resolve(chrome.runtime.lastError?{ok:false,error:chrome.runtime.lastError.message}:r)));
      if(!response?.ok)throw Error(String(response?.error||'GitHub research staging unavailable'));
      if(i===total-1 && response.staged!==true && response.unchanged!==true)
        throw Error('GitHub research staging did not confirm all transfer chunks');
      if(i%5===0)await sleep(0);
    }
  }
  async function stageVerifiedResearchGithub(selection,characters,completedRunId){
    let config;
    try{config=(await chrome.storage.local.get('dsGithubBackupPrefsV1')).dsGithubBackupPrefsV1;}catch{return;}
    if(!config||!['github','both'].includes(config.provider)||!config.categories?.includes('research')||!config.repository||config.paused)
      return {configured:false,staged:0,skipped:0,reused:0};
    let staged=0,skipped=0,reused=0;
    const visitedCharacters=new Set();
    const sourceVersion=(checkpoint)=>({archive:checkpoint.lastVerifiedPart||'',
      newestId:checkpoint.history?.newestMessageId||'',
      messageCount:checkpoint.history?.messages?.length||0,
      verifiedAt:checkpoint.history?.lastVerifiedAt||0});
    const matches=(left,right)=>!!left && Object.keys(right).every(key=>left[key]===right[key]);
    for(const entry of selection){
      ensureNotCancelled();
      // Only verified complete records are eligible. A failed/cancelled
      // export never stages missing or partial data as deletion.
      let checkpoint;
      try{checkpoint=await withStore('get',entry.conversationId);}catch{skipped++;continue;}
      if(checkpoint?.state!=='verified'||!checkpoint.history?.complete||!Array.isArray(checkpoint.history.messages)||
          ['unavailable','not-checked'].includes(checkpoint.memory?.status)){skipped++;continue;}
      const fingerprint=sourceVersion(checkpoint);
      const stageKey=`__github_stage_conversation_${entry.conversationId}`;
      const prior=await withStore('get',stageKey);
      if(matches(prior?.source,fingerprint)) reused++;
      else {
        const history=checkpoint.history;
        const stableHistory={messages:history.messages,complete:true,expected:history.expected,
          header:history.header,orphanedMessages:history.orphanedMessages||[]};
        const nativeMemories={status:checkpoint.memory.status,paginationComplete:true,
          memories:checkpoint.memory.items||[],reason:checkpoint.memory.reason||null};
        try{
          const story=await collectResearchStoryData(entry,history);
          ensureNotCancelled();
          await githubResearchStageRecord(`conversation:${entry.conversationId}`,{
            botId:entry.botId,conversationId:entry.conversationId,history:stableHistory,
            nativeMemories,rulebookStates:story.rulebook,storyMoments:story.moments,
            oocDirectives:story.ooc},completedRunId);
          await withStore('put',{conversationId:stageKey,source:fingerprint,at:Date.now()});
          staged++;
        }catch(error){skipped++;console.warn('[QoL GitHub Research] Verified conversation staging failed:',entry.conversationId,String(error?.message||error));}
      }
      if(!visitedCharacters.has(entry.botId)){
        visitedCharacters.add(entry.botId);
        const cachedCharacter=await withStore('get',`__character_${entry.botId}`);
        const character=characters.get(entry.botId)||cachedCharacter?.record;
        const incomplete=character?.linkedLorebooks?.some(b=>
          (b.status==='present'||b.status==='empty') && b.paginationComplete===false);
        // Character snapshots use their own checkpoint date, independent of chat messages.
        if(character?.fetchStatus==='present'&&!incomplete){
          const charKey=`__github_stage_character_${entry.botId}`;
          const charVersion=Number(cachedCharacter?.at||0);
          const marker=await withStore('get',charKey);
          if (charVersion && marker?.version===charVersion) reused++;
          else {
            const stable={...character};
            delete stable.fetchedAt;delete stable.lastRefreshError;
            try{
              await githubResearchStageRecord(`character:${entry.botId}`,{
                botId:entry.botId,character:stable},completedRunId);
              await withStore('put',{conversationId:charKey,version:charVersion,at:Date.now()});
              staged++;
            }catch(error){skipped++;console.warn('[QoL GitHub Research] Character staging failed:',entry.botId,String(error?.message||error));}
          }
        }
      }
      const checked=staged+skipped+reused;
      if(checked%12===0) {
        update(`GitHub research staging: ${checked}/${selection.length} verified records checked · ${staged} new`);
        await sleep(0);
      }
    }
    const finish=await new Promise(resolve=>{
      try{chrome.runtime.sendMessage({type:'DS_GITHUB_BACKUP_RESEARCH_FINISH',staged,skipped},r=>
        resolve(chrome.runtime.lastError?{ok:false,error:chrome.runtime.lastError.message}:r||{ok:false,error:'No response'}));}
      catch(error){resolve({ok:false,error:String(error?.message||error)});}
    });
    if(!finish?.ok)throw Error(`Could not schedule the GitHub upload: ${finish?.error||'unknown error'}`);
    console.info('[QoL GitHub Research] Verified checkpoint staging:',{staged,skipped,reused,queued:finish.queued});
    return {configured:true,staged,skipped,reused,queued:finish.queued};
  }
  async function sendSavedResearchGithub() {
    if (running) return;
    running=true;cancelled=false;
    startButton.disabled=true;freshButton.disabled=true;scanButton.disabled=true;quickScanButton.disabled=true;verifyButton.disabled=true;
    if (githubButton) githubButton.disabled=true;
    cancelButton.disabled=false;
    try {
      let prefs;
      try { prefs=(await chrome.storage.local.get('dsGithubBackupPrefsV1')).dsGithubBackupPrefsV1; } catch {}
      if (!prefs || !['github','both'].includes(prefs.provider) || !prefs.categories?.includes('research') || !prefs.repository || prefs.paused)
        throw Error('In Account & Sync → GitHub Backup, choose GitHub or Both, enable Verified Research Export data, and save preferences first.');
      update('Reading saved verified Research Export selection. No chats will be downloaded again.');
      const saved=await measure('selectionCheckpointRead',()=>withStore('get','__pilot_selection__'));
      if (!Array.isArray(saved?.entries) || !saved.entries.length) throw Error('No saved conversation selection yet. Use Scan bots first.');
      update(`Sending saved verified checkpoints to GitHub staging: ${saved.entries.length} conversations to check`);
      const result=await stageVerifiedResearchGithub(saved.entries,new Map(),crypto.randomUUID());
      update(`GitHub research staging complete: ${result.staged} changed, ${result.reused} already staged, ${result.skipped} unavailable. ${result.queued?'GitHub upload queued; check Account & Sync → GitHub Backup for the completed snapshot.':'Upload not queued; check GitHub Backup authorization, password and settings.'}`);
    } catch(error) {
      update(error?.message==='cancelled' ? 'GitHub staging stopped; already staged records remain safe.' : `GitHub research staging stopped: ${error?.message||error}`);
    } finally {
      running=false;
      startButton.disabled=false;freshButton.disabled=false;scanButton.disabled=false;quickScanButton.disabled=false;verifyButton.disabled=false;
      if(githubButton) githubButton.disabled=false;
      cancelButton.disabled=true;
      cancelled=false;
    }
  }
  async function scanOnly(limit, quick = true) {
    if (running) return;
    running=true;cancelled=false;progressBegin('scan');
    startButton.disabled=true;freshButton.disabled=true;scanButton.disabled=true;quickScanButton.disabled=true;verifyButton.disabled=true;
    cancelButton.disabled=false;if(githubButton)githubButton.disabled=true;setLimitDisabled(true);
    try {
      if (!DS.state?.settings?.enabled || !DS.state?.settings?.showBulkChatResearchExport)
        throw Error('Enable Research Export in QoL Settings first.');
      if (typeof DS.fetchConversationListPage !== 'function')throw Error('Conversation reader unavailable');
      // Normal Scan bots refreshes recent conversations; Full scan is the
      // explicit exhaustive operation. Start / Resume remains checkpoint-first.
      const selection=await discoverSelection(limit, true, quick);
      update((quick ? 'Recent scan: ' : 'Full scan: ') +
        selectionNote(selection)+` ${selection.discovery.liveBotChecks} live per-bot checks; ${selection.discovery.reusedBotScans} cached lists reused` +
        (selection.discovery.unverifiedOlderBots ? `; ${selection.discovery.unverifiedOlderBots} old bots not yet scanned (use Full scan for exhaustive discovery)` : '') +
        '. Start / Resume to export.');
      progressFinish();
    } catch (error) {
      progressStop(error?.message==='cancelled' ? 'Cancelled' : 'Stopped');
      update(error?.message==='cancelled'?'Bot scan cancelled. Completed bot scans are saved for Resume.':
        `Bot scan stopped: ${error?.message||error}. Completed scans remain saved.`);
    } finally {
      running=false;startButton.disabled=false;freshButton.disabled=false;scanButton.disabled=false;quickScanButton.disabled=false;verifyButton.disabled=false;
      cancelButton.disabled=true;if(githubButton)githubButton.disabled=false;setLimitDisabled(false);
    }
  }
  // Read the verified encrypted GitHub Research catalog once per manual run.
  // This returns only message counts and newest IDs, never message contents.
  // A locked, disabled, unreachable or older backup falls back to local checks.
  async function githubResearchCoverage(selected, fresh) {
    const empty = {records:new Map(),indexed:0,available:false};
    if (fresh || !selected.length) return empty;
    let config;
    try { config = (await chrome.storage.local.get('dsGithubBackupPrefsV1')).dsGithubBackupPrefsV1; }
    catch { return empty; }
    if (!config || !['github','both'].includes(config.provider) || config.paused ||
        !config.repository || !config.categories?.includes('research')) return empty;
    const records = new Map();
    const ids = selected.map(entry=>entry.conversationId);
    try {
      // The background provider enforces a 10k-ID maximum per request. Avoid
      // transferring the full catalog to the page for every single chat.
      for (let start=0;start<ids.length;start+=10000) {
        ensureNotCancelled();
        const slice=ids.slice(start,start+10000);
        const response=await measure('githubResearchIndexRead',()=>new Promise(resolve=>{
          const timer=setTimeout(()=>resolve({ok:false,reason:'index-read-timeout'}),45000);
          try {chrome.runtime.sendMessage({type:'DS_GITHUB_BACKUP_RESEARCH_INDEX',conversationIds:slice},reply=>{
            clearTimeout(timer);
            resolve(chrome.runtime.lastError ? {ok:false,error:chrome.runtime.lastError.message} : reply);
          });} catch(error) {clearTimeout(timer);resolve({ok:false,error:String(error?.message||error)});}
        }));
        if (!response?.ok) {
          update(`GitHub Research index unavailable (${String(response?.error||response?.reason||'not ready').slice(0,100)}). Using normal saved checkpoints.`);
          return empty;
        }
        for (const [id, row] of Object.entries(response.records||{})) if (UUID.test(id) &&
            Number.isSafeInteger(row?.messageCount) && row.messageCount>0 &&
            typeof row.newestMessageId==='string' && Number.isSafeInteger(row.verifiedAt))
          records.set(id,row);
        await sleep(0);
      }
    } catch (error) {
      if (cancelled) throw error;
      update(`GitHub Research index could not be read; using normal checkpoints (${String(error?.message||error).slice(0,90)}).`);
      return empty;
    }
    update(`GitHub Research index checked: ${records.size}/${selected.length} conversations have verified message summaries.`);
    return {records,indexed:records.size,available:true};
  }
  function historyMatchesGithub(entry, checkpoint, remote) {
    const history=checkpoint?.history;
    if (!remote || checkpoint?.state!=='verified' || !checkpoint.lastVerifiedPart ||
        history?.complete!==true || !Array.isArray(history.messages) ||
        history.messages.length!==remote.messageCount ||
        String(history.newestMessageId||'')!==remote.newestMessageId ||
        String(history.lastVerifiedMessageId||'')!==remote.newestMessageId ||
        memoryNeedsResume(checkpoint.memory) ||
        !Number.isSafeInteger(entry.expectedMessages) ||
        entry.expectedMessages!==remote.messageCount) return false;
    const checkedAt=Number(history.lastCheckedAt||history.lastVerifiedAt||0);
    if (!(checkedAt>0) || checkedAt>Date.now()+60000) return false;
    // Never accept stale cached list counts as proof of no new messages. Only
    // the just-refreshed per-bot list supports a zero-request history skip.
    // Same-count edits to older messages still need periodic reconciliation.
    const listAge=Date.now()-Number(entry.listVerifiedAt||0);
    if (!(listAge>=0 && listAge<15*60000)) return false;
    if (Date.now()-checkedAt > 72*3600000) return false;
    if (!(remote.verifiedAt>0) || remote.verifiedAt > Date.now()+60000) return false;
    return true;
  }
  async function latestPageMatchesGithub(entry, remote) {
    if (!remote || !entry.expectedMessages || entry.expectedMessages!==remote.messageCount) return false;
    // A verified GitHub record can be reused after a browser profile reset,
    // but only after a fresh API page confirms its newest message and count.
    // Never recreate missing local checkpoints or claim a new local ZIP.
    const response=await retry(()=>(DS.fetchChatHistoryPageShared||DS.fetchChatHistoryPage)(
      entry.botId,entry.conversationId,{limit:100,lastId:'',forceRefresh:true}), 'Verify GitHub history');
    const rows=response?.data?.messages;
    const count=Number(response?.data?.num_messages);
    return Array.isArray(rows) && rows.length>0 &&
      String(rows[0]?.id||'')===remote.newestMessageId && count===remote.messageCount;
  }
  async function canSkipGithubVerifiedLocal(entry,checkpoint,remote,characterMode) {
    if (!historyMatchesGithub(entry,checkpoint,remote)) return false;
    const history={...checkpoint.history,
      sync:{mode:'unchanged',checkedAt:Date.now(),fetchedPages:0,added:0,updated:0,anchorFound:true}};
    return mayReuseVerifiedArchive(checkpoint,entry,history,characterMode);
  }
  async function run(limit, fresh = false, launchWaitMs = 0, verifyAll = false) {
    const startupAt = performance.now();
    runId = crypto.randomUUID().replaceAll('-', ''); // Fresh filenames on each export, even in the same helper tab.
    characterReadCircuit=null;lorebookReadCircuit=null;linkedLorebookRunCache.clear();
    running=true;cancelled=false;progressBegin('export');archiveWorkerDisabled=false;archiveBackend='not-started';
    for (const key of Object.keys(phaseMs)) { delete phaseMs[key]; delete phaseCount[key]; delete phaseMaxMs[key]; }
    // Browser Web Locks may be delayed even before run-resumable-archive
    // starts. Keep that wait separate from work on the main thread.
    addPhase('launchToRun', launchWaitMs);
    if (launchWaitMs >= 1000) phaseAttribution('launchToRun', launchWaitMs);
    const exportOp = DS.isDiagnosticTraceActive?.('normal') ? DS.diagOperationStart?.('research-export','run-resumable-archive', {
      trigger: 'user-start', reason: fresh ? 'explicit-fresh-export' : 'resume-or-rebuild-export',
      phase: 'discover-retrieve-pack-verify', parentOperationId: ''
    }) : null;
    let exportOutcome = 'completed';
    startButton.disabled=true;freshButton.disabled=true;scanButton.disabled=true;quickScanButton.disabled=true;verifyButton.disabled=true;cancelButton.disabled=false;if(githubButton)githubButton.disabled=true;setLimitDisabled(true);
    let selected=[],saved=0;const completed=new Map();let completeCount=0;const memoryStatusCounts={};
    const characterByBot=new Map(),characterPartByBot=new Map(),characterStatusCounts={},characterErrors=[];
    try {
      if (!DS.state?.settings?.enabled || !DS.state?.settings?.showBulkChatResearchExport) throw Error('Enable Research Export in QoL Settings first.');
      if (typeof DS.fetchConversationListPage !== 'function' || typeof DS.fetchChatHistoryPage !== 'function' ||
          typeof DS.researchReadConversationMemories !== 'function') throw Error('Required shared chat or Memory reader is unavailable.');
      update('Checking Downloads permission (a browser permission prompt can make this wait; it is not ZIP CPU time)...');
      if (!await measure('downloadPermission',()=>DS.requestDownloadPermission?.())) throw Error('Downloads permission is needed to verify that ZIP parts actually saved.');
      if (fresh) {
        initialSelectionCache = null;
        update('Starting a fresh download of chat history, native Memories and character metadata...');
        await clearResearchCheckpoints();
      }
      // The last DB connection opens here and is kept only for this manual
      // run. This avoids a fresh open/close on every chat checkpoint while
      // leaving per-record transaction atomicity and checkpoints intact.
      exportDb = await measure('exportDbOpen', openDb);
      exportDb.onversionchange = () => {
        exportDb?.close();
        exportDb = null;
      };
      const priorSelection = initialSelectionCache || await measure('selectionCheckpointRead',()=>withStore('get','__pilot_selection__'));
      initialSelectionCache = null;
      // Every Start / Resume refreshes the recent head and current per-bot
      // lists. A saved selection alone cannot discover new chats or bots.
      // Older cached scans are retained; Full scan stays the exhaustive path.
      const selection = !fresh && priorSelection?.mode==='per-bot-all-v2' &&
        priorSelection?.limit===limit && Array.isArray(priorSelection?.entries)
        ? await measure('discovery',()=>discoverSelection(limit,true,true))
        : await measure('discovery',()=>discoverSelection(limit));
      const catalog=selection.entries;
      const githubCoverage = await githubResearchCoverage(catalog,fresh);
      const exportIndex=await measure('incrementalIndexRead',()=>loadVerifiedIndex(catalog));
      const workplan=buildIncrementalQueue(catalog,exportIndex,githubCoverage.records,
        {fresh,verifyAll,characterMode:characterRetryInput?.value||'reuse'});
      selected=workplan.work;
      const fullAuditIds=workplan.auditIds;
      const entryById=new Map(selected.map(entry=>[entry.conversationId,entry]));
      const saveIndex=()=>withStore('put',exportIndex);
      const markVerified=(entry,checkpoint,{fullAudit=false}={})=>{
        const next=verifiedIndexRow(checkpoint);
        if (!next) return;
        const old=exportIndex.rows[entry.conversationId];
        // Reuse the authoritative fresh list metadata even when unchanged
        // history checkpoints were not rewritten to IDB.
        if (Number(entry.expectedMessages)>0) next.listedMessages=entry.expectedMessages;
        next.activityStamp=listActivityStamp(entry)||old?.activityStamp||next.activityStamp;
        if (fullAudit) next.fullCheckedAt=Date.now();
        else if (old?.fullCheckedAt>0) next.fullCheckedAt=old.fullCheckedAt;
        exportIndex.rows[entry.conversationId]=next;
      };
      update(`Incremental queue: ${catalog.length} conversations retained · ${selected.length} to check (${workplan.auditing} older full-history audits) · ${workplan.excluded} verified chats deferred. No older backups removed.`);
      const startupMs = performance.now() - startupAt;
      addPhase('startupBeforeHistory', startupMs);
      if (DS.isDiagnosticTraceActive?.('normal')) DS.traceEvent?.('research-export', 'startup-ready', {
        operation: 'run-resumable-archive', trigger: 'user-start',
        durationMs: Math.round(startupMs), launchWaitMs: Math.round(launchWaitMs),
        selectedConversations: catalog.length,queuedConversations:selected.length,
        skippedFromQueue:workplan.excluded,olderAudits:workplan.auditing,
        githubSummaries: githubCoverage.indexed,
        // No conversation IDs, chat content, auth data or GitHub credentials.
        phases: Object.fromEntries(['downloadPermission','selectionCheckpointRead','exportDbOpen','discovery','githubResearchIndexRead','incrementalIndexRead']
          .filter(name => Number.isFinite(phaseMs[name]))
          .map(name => [name, {wallMs:Math.round(phaseMs[name]), calls:phaseCount[name]||0}]))
      });
      renderPhaseTimings();
      progressStage('export',selected.length,selected.length ? `0/${selected.length} active conversations · ${workplan.excluded} retained` : `No changed histories · ${catalog.length} already retained`);
      if (!catalog.length) throw Error('No conversations found.');
      update(`${selectionNote(selection)} Active work: ${selected.length}; verified histories deferred: ${workplan.excluded}.`);
      const staged=[];let totalMessages=0,totalMemories=0,failed=0,historyFailed=0,partNumber=1;
      let skippedUnchanged=0,skippedGithubFast=0,skippedGithubRemoteOnly=0;
      const reusedArchiveParts=new Map();
      const githubRemoteOnlyIds=[];
      let rulebookStateChats=0,storyMomentChats=0,oocDirectiveCount=0;
      let memoryAuthFailures=0;
      const remainingFiles = new Map();
      const flush=async () => {
        if (!staged.length) return;
        ensureNotCancelled();
        const stagedConversationCounts = new Map();
        for (const item of staged) if (item.conversationId) {
          stagedConversationCounts.set(item.conversationId,
            (stagedConversationCounts.get(item.conversationId) || 0) + 1);
        }
        const report={discovery:selection.discovery,selectedBots:selection.discovery.scannedBots,botSelection:limit,selectedConversations:catalog.length,queuedConversations:selected.length,skippedFromQueue:workplan.excluded,olderAudits:workplan.auditing,processedConversations:completed.size,
          conversationsInThisPart:[...stagedConversationCounts.keys()],messagesRead:totalMessages,memoriesRead:totalMemories,
          memoryFailures:failed,historyFailures:historyFailed,historyComplete:completeCount,
          exportMode:'incremental-changed-conversations',unchangedVerifiedConversations:skippedUnchanged,
          githubFastSkippedConversations:skippedGithubFast,
          githubRemoteOnlyConversations:skippedGithubRemoteOnly,
          githubRemoteOnlyIds:githubRemoteOnlyIds,
          previousArchivePartsRequired:[...reusedArchiveParts.keys()],
          archiveNote:'This part contains changed conversations only. Keep earlier verified ZIP parts for locally reused chats. Remote-only skips require your encrypted GitHub Research backup. Fresh makes a full standalone archive.',
          memoryStatuses:{...memoryStatusCounts},
          storyExport:{scope:'new-or-rebuilt-conversations-only',rulebookStateChats,storyMomentChats,oocDirectiveCount,
            coverage:'Only data returned by existing conversation/history APIs and explicit user OOC lines; missing private state is not inferred'},
          characterFilesInThisPart:staged.filter(x=>x.kind==='character').map(x=>x.entry.name),
          characterCompleteness:{uniqueBotsCollected:characterByBot.size,fetchStatuses:{...characterStatusCounts},
            linkedLorebooksRead:[...characterByBot.values()].reduce((n,c)=>n+(c.linkedLorebooks||[]).filter(b=>
              (b.status==='present'||b.status==='empty') && b.paginationComplete===true).length,0),
            fieldStatuses:[...characterByBot.values()].reduce((sum,c)=>{for(const [key,count] of Object.entries(c.completeness?.fieldStatuses||{}))sum[key]=(sum[key]||0)+count;return sum;},{}),
            errorCount:characterErrors.length,
            issueBreakdown:characterErrors.reduce((counts,error)=>{
              const key=error.scope==='lorebook' && /pagination incomplete/i.test(String(error.reason||''))
                ? 'lorebook-pagination-incomplete'
                : error.scope==='character' && error.status==='fetch_failed'
                  ? 'character-metadata-fetch-failed'
                  : `${String(error.scope||'other')}:${String(error.status||'unknown')}`;
              counts[key]=(counts[key]||0)+1;return counts;
            },{}),
            errorsTruncated:Math.max(0,characterErrors.length-500),
            // Keep full actionable per-bot failure details for typical exports,
            // bounded for extremely large exports. No IDs are sent to Inspector.
            errors:characterErrors.slice(-500)},
          incompleteConversations:[...stagedConversationCounts.keys()].filter(id=>{
            const record=completed.get(id);return record && (!record.historyComplete||record.memoryStatus==='unavailable'||!record.memoryComplete);
          })};
        update(`Saving and verifying archive part ${partNumber}...`);
        const info=await measure('zipBuildAndDownloadTotal',()=>downloadPart(staged.map(x=>x.entry),partNumber,report));
        renderPhaseTimings();
        for (const [id,count] of stagedConversationCounts) {
          const remaining = (remainingFiles.get(id) || 0) - count;
          remainingFiles.set(id, remaining);
          if (remaining > 0) continue; // No chat is complete until every part is verified.
          const row=completed.get(id);
          const old=await withStore('get',id);
          if (old && row) {
            const verified={...old,
              history:old.history && row.historyComplete ? {...old.history,
                lastVerifiedMessageId:String(old.history.messages?.at(-1)?.id||''),
                lastVerifiedAt:Date.now()} : old.history,
              state:row.memoryStatus==='unavailable'||row.memoryStatus==='not-checked'||!row.historyComplete||!row.memoryComplete?'verified-incomplete':'verified',lastVerifiedPart:info.filename};
            await withStore('put',verified);
            const source=entryById.get(id);
            if(source)markVerified(source,verified,{fullAudit:fullAuditIds.has(id)||
              ['initial-full','full-reconcile-audit','full-reconcile-missing-anchor'].includes(verified.history?.sync?.mode)});
          }
        }
        await saveIndex();
        saved++;staged.length=0;partNumber++;
      };
      let partSize=0;
      for (let index=0;index<selected.length;index++) {
        ensureNotCancelled();
        // Persist a small in-flight window before any checkpoint may become
        // staged. If a tab crashes midway, remaining work stays pending on
        // Resume even if a chat had a verified older ZIP. Avoid a write for
        // every one of thousands of conversations during Verify all.
        if (index%64===0) {
          for(let j=index;j<Math.min(index+64,selected.length);j++) {
            const queued=selected[j],old=exportIndex.rows[queued.conversationId]||{};
            exportIndex.rows[queued.conversationId]={...old,botId:queued.botId,backup:'pending'};
          }
          await saveIndex();
        }
        const entry=selected[index];
        update(`Conversation ${index+1}/${selected.length} · ${entry.botName||'Chat'} · ${totalMessages} messages · ${totalMemories} Memories · ${saved} saved parts`);
        let checkpoint=await withStore('get',entry.conversationId);
        const verifiedBefore = checkpoint;
        if (wasLegacyCountOnlyMismatch(checkpoint)) {
          // Keep downloaded message and Memory records; rebuild only the
          // corrected ZIP metadata from the local checkpoint on Resume.
          checkpoint={...checkpoint,history:{...checkpoint.history,complete:true,error:null}};
          await withStore('put',checkpoint);
          update(`Reusing saved chat data for ${index+1}/${selected.length}; correcting a message-count warning`);
        }
        const remote=githubCoverage.records.get(entry.conversationId);
        if (!fresh && !verifyAll && !fullAuditIds.has(entry.conversationId) && await canSkipGithubVerifiedLocal(entry,checkpoint,remote,
            characterRetryInput?.value||'reuse')) {
          // GitHub and the complete local verified ZIP agree on count and
          // latest ID. A recent history check means no new API page is needed.
          skippedUnchanged++;skippedGithubFast++;
          markVerified(entry,checkpoint);
          reusedArchiveParts.set(String(checkpoint.lastVerifiedPart),
            (reusedArchiveParts.get(String(checkpoint.lastVerifiedPart))||0)+1);
          totalMessages+=checkpoint.history.messages.length;
          totalMemories+=Array.isArray(checkpoint.memory?.items)?checkpoint.memory.items.length:0;
          completeCount++;
          memoryStatusCounts[checkpoint.memory.status]=(memoryStatusCounts[checkpoint.memory.status]||0)+1;
          completed.set(entry.conversationId,{conversationId:entry.conversationId,
            historyComplete:true,memoryStatus:checkpoint.memory.status,memoryComplete:true,reused:true});
          progressTick(index+1,selected.length,`${skippedGithubFast} GitHub-verified chats skipped without history requests · ${totalMessages} saved messages`);
          if (index%25===0) await sleep(0);
          continue;
        }
        if (!fresh && !verifyAll && !fullAuditIds.has(entry.conversationId) && (characterRetryInput?.value||'reuse')==='reuse' && remote &&
            (!checkpoint?.history?.complete || checkpoint.state!=='verified') &&
            entry.expectedMessages===remote.messageCount) {
          // After cache loss, GitHub may be the only verified archive. Check
          // live newest ID/count before accepting the remote record, rather
          // than downloading all old pages or fabricating a local checkpoint.
          let verified=false;
          try {verified=await measure('githubNewestPageVerification',()=>latestPageMatchesGithub(entry,remote));}
          catch (error) {if(cancelled)throw error;}
          if (verified) {
            skippedGithubRemoteOnly++;githubRemoteOnlyIds.push(entry.conversationId);
            exportIndex.rows[entry.conversationId]={botId:entry.botId,backup:'github',
              savedMessages:remote.messageCount,listedMessages:remote.messageCount,
              newestMessageId:remote.newestMessageId,activityStamp:listActivityStamp(entry),
              checkedAt:Date.now(),fullCheckedAt:0};
            completed.set(entry.conversationId,{conversationId:entry.conversationId,
              historyComplete:true,memoryStatus:'github-verified',memoryComplete:true,reusedGithub:true});
            progressTick(index+1,selected.length,`${skippedGithubRemoteOnly} conversations already backed up on GitHub · newest page verified`);
            if (index%25===0) await sleep(0);
            continue;
          }
        }
        // Missing, changed or older checkpoints still read the newest API
        // page, then stop at the saved high-water mark. Fresh downloads all.
        let historyError = null;
        const savedHistory = checkpoint?.history;
        try {
          const history=await measure('historyReadTotal',()=>readHistory(entry,savedHistory,verifyAll||fullAuditIds.has(entry.conversationId)));
          const sync=history.sync || {};
          if (sync.mode === 'catch-up') {
            update(`Caught up conversation ${index+1}/${selected.length}: +${sync.added||0} messages, ${sync.updated||0} refreshed · ${sync.fetchedPages||0} pages checked`);
          } else if (sync.mode === 'full-reconcile-missing-anchor') {
            update(`Re-read conversation ${index+1}/${selected.length}: previous latest message no longer exists; saved missing records retained locally`);
          }
          if (await mayReuseVerifiedArchive(verifiedBefore,entry,history,characterRetryInput?.value||'reuse')) {
            // Nothing changed on the newest history page. Keep the verified
            // checkpoint as-is rather than writing its entire message array
            // and reserializing every reply into another ZIP.
            checkpoint=verifiedBefore;
            markVerified(entry,checkpoint,{fullAudit:verifyAll||fullAuditIds.has(entry.conversationId)});
            skippedUnchanged++;
            const oldPart=String(checkpoint.lastVerifiedPart);
            reusedArchiveParts.set(oldPart,(reusedArchiveParts.get(oldPart)||0)+1);
            const oldMemory=checkpoint.memory;
            totalMessages+=checkpoint.history.messages.length;
            totalMemories+=Array.isArray(oldMemory?.items)?oldMemory.items.length:0;
            completeCount++;
            memoryStatusCounts[oldMemory.status]=(memoryStatusCounts[oldMemory.status]||0)+1;
            completed.set(entry.conversationId,{conversationId:entry.conversationId,
              historyComplete:true,memoryStatus:oldMemory.status,memoryComplete:true,reused:true});
            progressTick(index+1,selected.length,
              `${skippedUnchanged} verified chats unchanged · ${totalMessages} messages retained · ${saved} new ZIP parts`);
            if(index % 25===0)await sleep(0);
            continue;
          }
          checkpoint={...checkpoint,conversationId:entry.conversationId,entry,history,
            state:'staged',at:Date.now()};
          await withStore('put',checkpoint);
        } catch (error) {
          if (cancelled) throw error;
          historyError=error;
          if (savedHistory?.complete && Array.isArray(savedHistory.messages)) {
            // Never discard a successful earlier snapshot if a catch-up
            // request fails. Record its stale status in the ZIP metadata,
            // and retry on the next Start / Resume.
            checkpoint={...checkpoint,entry,history:{...savedHistory,
              sync:{mode:'catch-up-failed',checkedAt:Date.now(),error:
                String(error?.message||error).slice(0,160)}},state:'staged',at:Date.now()};
            update(`History catch-up failed for ${index+1}/${selected.length}; preserving ${savedHistory.messages.length} previously saved messages`);
          } else {
            checkpoint={...checkpoint,conversationId:entry.conversationId,entry,
              history:{messages:[],header:null,pages:0,expected:entry.expectedMessages,
                complete:false,error:'History API failed: '+String(error?.status || error?.message || 'unknown').slice(0,120)},
              state:'failed-history',at:Date.now()};
          }
          await withStore('put',checkpoint);
        }
        if (!historyError && memoryNeedsResume(checkpoint.memory)) {
          const memory=await measure('memoryReadTotal',()=>readMemories(entry, checkpoint.memory, async partial => {
            checkpoint={...checkpoint,memory:partial,state:'staged',at:Date.now()};
            await withStore('put',checkpoint);
          }));
          checkpoint={...checkpoint,memory,state:'staged',at:Date.now()};
          await withStore('put',checkpoint);
        }
        if (historyError) {
          // Catch-up failures must not erase previously saved native Memories.
          if (!checkpoint.memory) checkpoint.memory={status:'not-checked',reason:'history-read-failed',items:null};
          ++historyFailed;
        }
        const history=checkpoint.history,memory=checkpoint.memory;
        totalMessages+=history.messages.length;
        if (Array.isArray(memory?.items)) totalMemories+=memory.items.length;
        else if (memory?.status === 'unavailable') {
          failed++;
          if (['auth-unavailable','auth-rejected','access-denied','unexpected-memory-format','invalid-json','not-enabled'].includes(memory.reason)) memoryAuthFailures++;
        }
        completed.set(entry.conversationId,{conversationId:entry.conversationId,historyComplete:history.complete && history.sync?.mode!=='catch-up-failed',memoryStatus:memory.status,memoryComplete:!memoryNeedsResume(memory)});
        if (history.complete && history.sync?.mode!=='catch-up-failed') completeCount++;
        memoryStatusCounts[memory.status]=(memoryStatusCounts[memory.status]||0)+1;
        // One character snapshot/file per unique bot across all archive parts.
        // Each conversation points to its file; a later part may reference an
        // earlier part, so also record which ZIP contains the character JSON.
        if (!characterByBot.has(entry.botId)) {
          const character=await measure('characterReadTotal',()=>readCharacter(entry,characterRetryInput?.value||'reuse'));
          characterByBot.set(entry.botId,character);
          characterStatusCounts[character.fetchStatus]=(characterStatusCounts[character.fetchStatus]||0)+1;
          for (const err of character.completeness?.errors||[]) characterErrors.push({botId:entry.botId,...err});
          if (character.lastRefreshError) characterErrors.push({botId:entry.botId,scope:'refresh',...character.lastRefreshError});
          const file=await zippedEntry(characterFile(entry.botId),character);
          const projected=file.data.length+file.nameBytes.length+250;
          if (projected>PART_TARGET) throw Error('A character file exceeds the archive size limit');
          if (partSize+projected>PART_TARGET && staged.length) {await flush();partSize=0;}
          characterPartByBot.set(entry.botId,`spicychat-research-${runId}-part-${String(partNumber).padStart(3,'0')}.zip`);
          staged.push({conversationId:null,kind:'character',entry:file});
          partSize+=projected;
        }
        // These files are derived from already-fetched history/metadata only;
        // adding them never triggers more network requests or invalidates a
        // completed history/Memory checkpoint.
        const storyResearch=await measure('storyStateIndex',()=>collectResearchStoryData(entry,history));
        if(storyResearch.rulebook.status==='present') rulebookStateChats++;
        if(storyResearch.moments.status==='present') storyMomentChats++;
        oocDirectiveCount+=storyResearch.ooc.found;
        // Keep unedited JSON and original message fields, including exact Markdown and timestamps.
        const fileList=[];
        // Conversation-specific API metadata stays intact, while the repeated
        // nested character object lives once in characters/<bot-id>.json.
        const slimRow = entry.row && typeof entry.row==='object' && !Array.isArray(entry.row)
          ? Object.fromEntries(Object.entries(entry.row).filter(([key])=>key!=='character')) : entry.row;
        fileList.push(await zippedEntry(`conversations/${entry.conversationId}/conversation.json`,{
          conversation:{...entry,row:slimRow},characterFile:characterFile(entry.botId),
          characterArchivePart:characterPartByBot.get(entry.botId),
          history:{expected:history.expected,retrieved:history.messages.length,pages:history.pages,
            complete:history.complete && history.sync?.mode!=='catch-up-failed',
            error:history.sync?.mode==='catch-up-failed' ? 'Catch-up API unavailable; saved snapshot reused' : history.error,
            countWarning:history.countWarning||null,apiMetadata:history.header,
            newestSavedMessageId:history.newestMessageId||String(history.messages.at(-1)?.id||''),
            sync:history.sync||null,orphanedCheckpointMessages:history.orphanedMessages?.length||0},
          memoryStatus:memory.status,memoryError:memory.reason||null,
          memoryPaginationComplete:!memoryNeedsResume(memory),
          storyResearchFiles:{rulebookStates:'rulebook-states.json',storyMoments:'story-moments.json',
            oocDirectives:'ooc-directives.json'},
          storyResearchStatus:{rulebook:storyResearch.rulebook.status,moments:storyResearch.moments.status,
            ooc:storyResearch.ooc.status,historyComplete:storyResearch.rulebook.historyComplete}}));
        fileList.push(await zippedEntry(`conversations/${entry.conversationId}/rulebook-states.json`,storyResearch.rulebook));
        fileList.push(await zippedEntry(`conversations/${entry.conversationId}/story-moments.json`,storyResearch.moments));
        fileList.push(await zippedEntry(`conversations/${entry.conversationId}/ooc-directives.json`,storyResearch.ooc));
        fileList.push(await zippedEntry(`conversations/${entry.conversationId}/memories.json`,{conversationId:entry.conversationId,
          source:'spicychat-native-memories',status:memory.status,reason:memory.reason||null,httpStatus:memory.httpStatus||null,
          paginationComplete:!memoryNeedsResume(memory),pages:memory.pages|| (Array.isArray(memory.items)&&memory.items.length ? 1 : 0),
          memories:memory.items}));
        let chunkIndex=1;
        // Bound each worker handoff to 150 messages (or less). The worker
        // serializes each message once, and can split earlier for 2 MB chunks.
        for(let offset=0;offset<history.messages.length;offset+=150){
          ensureNotCancelled();
          const batch=history.messages.slice(offset,offset+150);
          const packed=await zippedMessages(entry.conversationId,batch,chunkIndex);
          chunkIndex=packed.nextChunkIndex;
          fileList.push(...packed.entries);
          await sleep(0);
        }
        if(!history.messages.length){
          const packed=await zippedMessages(entry.conversationId,[],chunkIndex);
          fileList.push(...packed.entries);
        }
        // A deleted/regenerated latest message requires a full live-history
        // reconcile. Preserve any previously exported records that disappeared
        // from that API snapshot as separate, clearly historical ZIP entries.
        // Never mix them with the current conversation timeline or silently
        // discard them from the local checkpoint.
        const orphaned = Array.isArray(history.orphanedMessages) ? history.orphanedMessages : [];
        for (let offset=0;offset<orphaned.length;offset+=150) {
          ensureNotCancelled();
          fileList.push(await zippedEntry(
            `conversations/${entry.conversationId}/previously-saved-unavailable-${String(1+Math.floor(offset/150)).padStart(4,'0')}.json`,
            {conversationId:entry.conversationId,status:'previously-saved-not-in-current-api-history',
             note:'Historical backup copy only. Do not treat these records as currently available messages.',
             messages:orphaned.slice(offset,offset+150)}));
          await sleep(0);
        }
        remainingFiles.set(entry.conversationId, fileList.length);
        for (const file of fileList) {
          const projected=file.data.length+file.nameBytes.length+250;
          if(partSize+projected>PART_TARGET && staged.length) {await flush();partSize=0;}
          if(projected>PART_TARGET) throw Error('A single file exceeds the archive size limit');
          staged.push({conversationId:entry.conversationId,entry:file});partSize+=projected;
        }
        if (historyError && [401, 403, 429].includes(Number(historyError?.httpStatus || 0))) {
          await flush();
          throw Error('Chat history was rejected or rate-limited. Stopped to protect the account; saved parts are verified and can be resumed.');
        }
        if (memoryAuthFailures >= 2 || memory?.reason === 'rate-limited') {
          await flush();
          throw Error('Native Memory access failed on multiple conversations. Stopped further Memory requests; completed data is checkpointed.');
        }
        progressTick(index+1,selected.length,`${index+1}/${selected.length} conversations · ${totalMessages} messages · ${totalMemories} Memories · ${saved} ZIP parts`);
        await sleep(350);
      }
      await flush();
      await saveIndex(); // includes audited/reused chats even when no new ZIP was needed
      progressFinish();
      renderPhaseTimings();
      const failedCharacters=characterStatusCounts.fetch_failed||0;
      const incompleteLorebooks=characterErrors.filter(error=>error.scope==='lorebook' &&
        /pagination incomplete/i.test(String(error.reason||''))).length;
      update(`Export finished (${selection.discovery.scannedBots} bots, ${catalog.length} saved conversations, ${selected.length} checked, ${workplan.excluded} already backed up and deferred): ${skippedUnchanged} unchanged local chats reused (${skippedGithubFast} skipped without history requests), ${skippedGithubRemoteOnly} verified only on GitHub, ${totalMessages} messages checked in this run, ${totalMemories} native Memories checked, ${characterByBot.size} updated character records, ${saved} new ZIP parts. ${failedCharacters} character fetch failures, ${incompleteLorebooks} incomplete Lorebooks, ${characterErrors.length} metadata issues; ${failed} Memory reads unavailable, ${historyFailed} history reads failed.` +
        (skippedUnchanged || skippedGithubRemoteOnly ? ' Keep older ZIP parts and any GitHub Research backups for reused chats; Fresh creates a complete standalone archive.' : ''));
      // Stage only changed Research records. The browser's GitHub backup
      // service then uploads them when authorized; download verification and
      // saved ZIPs do not depend on GitHub availability.
      try {
        if (!selected.length) {
          update('Export finished · no changed Research records to stage; existing GitHub and ZIP backups are unchanged.');
        } else {
        const github=await stageVerifiedResearchGithub(selected,characterByBot,runId);
        if(github?.configured)update(`Export finished · GitHub research ${github.queued?'upload queued':'staged but not queued'}: ${github.staged} changed records, ${github.reused} already staged, ${github.skipped} skipped. Check GitHub Backup for upload status. Keep earlier ZIP parts for unchanged chats.`);
        else update(`Export finished · GitHub research backup isn't configured here. ZIP exports are local; enable the Research category in GitHub Backup to send verified records.`);
        }
      } catch(error) {
        update(`Export finished · ZIP downloads are verified, but GitHub staging needs attention: ${error?.message||error}. Your saved exports are safe.`);
      }
    } catch (error) {
      exportOutcome = error?.message === 'cancelled' ? 'cancelled' : 'failed';
      progressStop(error?.message==='cancelled' ? 'Cancelled' : 'Stopped');
      update(error?.message==='cancelled' ? `Stopped. ${saved} archive parts verified; completed conversations remain locally checkpointed.` :
        `Stopped: ${error?.message||error}. ${saved} archive parts verified. Local checkpoints are preserved for Resume.`);
    } finally {
      stopArchiveWorker();
      linkedLorebookRunCache.clear();
      if (progressTimer) {clearTimeout(progressTimer); progressTimer=null;}
      if (pendingProgress) {applyProgress(pendingProgress);pendingProgress='';}
      renderPhaseTimings();
      console.info('[DragonScript Research Export] Archive backend:',archiveBackend,'Phase timings (ms; API phases include network pacing):', {...phaseMs});
      if (exportOp) DS.diagOperationEnd?.(exportOp, {
        outcome: exportOutcome, counts: { scanned: selected.length, changed: completed.size, skipped: selected.length - completed.size },
        meta: { archiveBackend, verifiedParts: saved,
          phases: Object.fromEntries(Object.entries(phaseMs).map(([name, ms]) => [name, {
            wallMs: Math.round(ms), count: phaseCount[name] || 0,
            maxWallMs: Math.round(phaseMaxMs[name] || 0)
          }])), activeMeasurement: 'phase-wall-includes-api-and-download-waits' }
      });
      // No export database connection lives beyond a user-requested run.
      const finishedDb=exportDb;
      exportDb=null;
      try { finishedDb?.close(); } catch {}
      running=false;startButton.disabled=false;freshButton.disabled=false;scanButton.disabled=false;quickScanButton.disabled=false;verifyButton.disabled=false;cancelButton.disabled=true;if(githubButton)githubButton.disabled=false;setLimitDisabled(false);
    }
  }
  function setLimitDisabled(busy) {
    limitInput.disabled = busy || allBotsInput.checked;
    allBotsInput.disabled = busy;
    if(characterRetryInput) characterRetryInput.disabled=busy;
  }
  function chosenLimit() {
    if (allBotsInput.checked) return 'all';
    const n=Number(limitInput.value);
    if (!Number.isSafeInteger(n) || n < 1) throw Error('Choose a whole number of bots (1 or more), or select All bots.');
    return n;
  }
  function launch(action, fresh = false) {
    if (running || launching) return;
    let limit;
    if (action !== 'github') {
      try { limit=chosenLimit(); } catch (error) { update(error.message); return; }
    }
    if (limit==='all' && action==='scan-full' && !window.confirm('Full scan will recheck ALL bots and conversations, potentially taking hours. Continue?')) return;
    if (limit==='all' && (action==='export' || action==='fresh') && !window.confirm('Export all saved conversations? This may take a long time and create many ZIP parts. Continue?')) return;
    if(action==='verify-all' && !window.confirm('Verify all saved chat histories, including older messages? This may take hours. Previous checkpoints and ZIP files are preserved. Continue?'))return;
    if (fresh && !window.confirm('Download all selected conversations, native Memories and character metadata again? This clears only the research exporter’s local checkpoints. Previously downloaded ZIP files are not removed.')) return;
    const requestAt=performance.now();
    const job=()=>action==='github' ? sendSavedResearchGithub() : action==='scan' ? scanOnly(limit, true) : action==='scan-full' ? scanOnly(limit, false) : run(limit,fresh,performance.now()-requestAt,action==='verify-all');
    // One manual export/scan per browser profile. No extra timers or tab
    // observers, and a second helper tab cannot race the same checkpoints.
    launching=true;
    void (async()=>{
      try {
        if (navigator.locks?.request) {
          await navigator.locks.request('dsq-research-export-v1',{mode:'exclusive',ifAvailable:true},async lock=>{
            if (!lock) {update('A Research Export is already running in another SpicyChat tab. Finish or cancel it there first.');return;}
            await job();
          });
        } else await job(); // Browsers without Web Locks keep the old behavior.
      } catch (error) {update(`Research Export could not start: ${error?.message||error}`);}
      finally {launching=false;}
    })();
  }
  function render() {
    if(document.getElementById('ds-bulk-research-panel')) return;
    const panel=document.createElement('section');panel.id='ds-bulk-research-panel';
    panel.style.cssText='position:fixed;z-index:2147483000;right:10px;top:70px;width:min(540px,calc(100vw - 20px));box-sizing:border-box;max-height:80vh;overflow-y:auto;overflow-x:hidden;padding:12px 14px;background:#181a22;color:#f5f5f5;border:1px solid #777;border-radius:12px;box-shadow:0 5px 35px #000a;font:13px/1.4 sans-serif';
    const title=document.createElement('h3');title.textContent='Bulk Chat, Memory & Character Research Export';title.style.cssText='margin:0 0 6px;font-size:17px;line-height:1.3';panel.append(title);
    const hint=document.createElement('p');hint.textContent='Start / Resume checks recent changes and a small rotation of older chats, without looping over every saved conversation. The full catalog and older verified ZIP/GitHub backups remain necessary. Scan bots updates recent discovery; Full scan discovers every bot; Verify all checks every saved history; Fresh rebuilds a complete standalone archive. Older edits or native Memory changes may require Verify all / Fresh.';hint.style.cssText='margin:0 0 8px';panel.append(hint);
    const selectors=document.createElement('div');selectors.style.cssText='display:flex;align-items:center;gap:12px;flex-wrap:wrap';
    const label=document.createElement('label');label.textContent='Recent bots to export ';label.style.whiteSpace='nowrap';
    limitInput=document.createElement('input');limitInput.type='number';limitInput.min='1';limitInput.step='1';limitInput.value=String(DEFAULT_BOTS);limitInput.style.cssText='width:65px;color:black';label.append(limitInput);selectors.append(label);
    const allLabel=document.createElement('label');allLabel.style.cssText='display:flex;align-items:center;gap:6px;white-space:nowrap';
    allBotsInput=document.createElement('input');allBotsInput.type='checkbox';allLabel.append(allBotsInput,document.createTextNode('All bots'));selectors.append(allLabel);panel.append(selectors);
    allBotsInput.addEventListener('change',()=>setLimitDisabled(false));
    const charRow=document.createElement('label');charRow.style.cssText='display:flex;align-items:center;gap:6px;margin:6px 0;flex-wrap:wrap';
    charRow.append(document.createTextNode('Character metadata: '));
    characterRetryInput=document.createElement('select');characterRetryInput.title='Reuse character checkpoints, retry failed or incomplete linked Lorebooks, or refresh all bots. Cached snapshots refresh when their conversations are checked; select Refresh all to update every bot.';
    for (const [value,name] of [['reuse','Reuse cached / update stale'],['retry-failed','Retry failed / incomplete'],['refresh','Refresh all character metadata']]) {
      const option=document.createElement('option');option.value=value;option.textContent=name;characterRetryInput.append(option);
    }
    characterRetryInput.style.cssText='max-width:100%;background:#343e5e;color:white;padding:4px;border-radius:5px';
    charRow.append(characterRetryInput);panel.append(charRow);

    const buttons=document.createElement('div');buttons.style.cssText='display:flex;flex-wrap:nowrap;overflow-x:auto;gap:6px;margin:9px 0;max-width:100%;white-space:nowrap;scrollbar-width:thin';
    startButton=document.createElement('button');startButton.textContent='Start / Resume';
    scanButton=document.createElement('button');scanButton.textContent='Scan bots';scanButton.title='Incremental: scan recent bot/chat changes and reuse older verified scans';
    quickScanButton=document.createElement('button');quickScanButton.textContent='Full scan';quickScanButton.title='Exhaustive bot and conversation discovery only (may take hours)';
    verifyButton=document.createElement('button');verifyButton.textContent='Verify all';verifyButton.title='Check every saved chat history, including old edits, without clearing previous checkpoints or archive parts';
    freshButton=document.createElement('button');freshButton.textContent='Fresh';freshButton.title='Download all chats, Memories and character metadata again, clearing only research checkpoints';freshButton.setAttribute('aria-label','Download fresh');
    githubButton=document.createElement('button');githubButton.textContent='Send saved research to GitHub';githubButton.title='Stage previously verified Research Export checkpoints for your configured private GitHub backup. Does not download chats or create new ZIPs.';
    cancelButton=document.createElement('button');cancelButton.textContent='Cancel';cancelButton.disabled=true;
    const close=document.createElement('button');close.textContent='Close';
    // Restore the previous scan scope before accepting Start / Resume.
    // Without this guard the UI defaults to 50 after a reload, even if the
    // saved checkpoint covered thousands of bots or All bots.
    startButton.disabled=true;scanButton.disabled=true;quickScanButton.disabled=true;verifyButton.disabled=true;freshButton.disabled=true;
    for(const b of [startButton,quickScanButton,scanButton,verifyButton,freshButton,githubButton,cancelButton,close]) b.style.cssText='flex:0 0 auto;padding:6px 6px;border-radius:6px;background:#343e5e;color:white;cursor:pointer;white-space:nowrap;font:12px sans-serif';
    buttons.append(startButton,quickScanButton,scanButton,verifyButton,freshButton,githubButton,cancelButton,close);panel.append(buttons);
    const progressBox=document.createElement('div');
    progressBox.style.cssText='padding:8px 0;margin:4px 0 8px;border-top:1px solid #3b4259;border-bottom:1px solid #3b4259';
    progressTitle=document.createElement('div');progressTitle.textContent='Ready · 3 steps';
    progressTitle.style.cssText='font-weight:600;margin-bottom:5px';
    const track=document.createElement('div');track.setAttribute('role','progressbar');
    track.setAttribute('aria-label','Research Export current step');track.setAttribute('aria-valuemin','0');
    track.setAttribute('aria-valuemax','100');track.setAttribute('aria-valuenow','0');
    track.style.cssText='height:8px;background:#323a4e;border-radius:6px;overflow:hidden';
    progressMeter=document.createElement('div');progressMeter.style.cssText='width:0%;height:100%;background:#719bd3;transition:width .15s linear';track.append(progressMeter);
    progressEta=document.createElement('div');progressEta.textContent='ETA appears after a few completed items';
    progressEta.style.cssText='color:#c9d7ed;margin-top:5px';
    progressDetail=document.createElement('div');progressDetail.style.cssText='opacity:.85;overflow-wrap:anywhere';
    phaseTimingsLabel=document.createElement('div');
    phaseTimingsLabel.style.cssText='opacity:.72;font-size:11px;overflow-wrap:anywhere;margin-top:5px';
    phaseTimingsLabel.textContent='Phase timings appear after export work completes';
    progressBox.append(progressTitle,track,progressEta,progressDetail,phaseTimingsLabel);panel.append(progressBox);
    log=document.createElement('pre');log.textContent='Loading saved Research Export selection…';
    log.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0;font:12px/1.5 monospace';log.setAttribute('role','status');panel.append(log);
    startButton.addEventListener('click',()=>launch('export'));
    scanButton.addEventListener('click',()=>launch('scan'));
    quickScanButton.addEventListener('click',()=>launch('scan-full'));
    verifyButton.addEventListener('click',()=>launch('verify-all'));
    freshButton.addEventListener('click',()=>launch('export',true));
    githubButton.addEventListener('click',()=>launch('github'));
    cancelButton.addEventListener('click',()=>{
      const syncAt=performance.now();
      cancelled=true;cancelButton.disabled=true;stopArchiveWorker('cancelled');
      const syncMs=performance.now()-syncAt;
      addPhase('cancelDispatchSync',syncMs);
      if (syncMs >= 32) phaseAttribution('cancelDispatchSync',syncMs);
      update('Stopping; saved research checkpoints are preserved...');
    });
    close.addEventListener('click',()=>{if(running){update('Cancel the export before closing.');return;}panel.remove();});
    document.documentElement.append(panel);
    setLimitDisabled(true);
    // Only load the small selection summary at panel startup; thousands of
    // saved conversation records are read when an export actually begins.
    void (async () => {
      try {
        let summary = await withStore('get','__pilot_selection_summary__');
        if (!summary) {
          // Upgrade a previously saved selection once, after the panel paints.
          await sleep(0);
          const old = await withStore('get','__pilot_selection__');
          if (old?.mode==='per-bot-all-v2' && Array.isArray(old.entries)) {
            initialSelectionCache = old;
            summary = {conversationId:'__pilot_selection_summary__',limit:old.limit,conversationCount:old.entries.length,at:Date.now()};
            await withStore('put',summary);
          } else {
            const unfinished = await withStore('get','__recent_bot_scan__');
            if (unfinished?.limit === 'all' || Number.isSafeInteger(unfinished?.limit)) {
              summary={conversationId:'__pilot_selection_summary__',limit:unfinished.limit,at:Date.now()};
              await withStore('put',summary);
            }
          }
        }
        if (!panel.isConnected) return;
        const priorLimit = summary?.limit;
        if (priorLimit === 'all') allBotsInput.checked = true;
        else if (Number.isSafeInteger(priorLimit) && priorLimit > 0) limitInput.value = String(priorLimit);
        setLimitDisabled(false);
        const count = Number.isSafeInteger(summary?.conversationCount) ? summary.conversationCount : null;
        applyProgress(count !== null
          ? `Restored selection: ${count} conversations. Start / Resume now checks for new bots and conversations automatically.`
          : 'Ready. Start / Resume checks recent bots and conversations; Full scan checks the entire account.');
        startButton.disabled=false;scanButton.disabled=false;quickScanButton.disabled=false;verifyButton.disabled=false;freshButton.disabled=false;
      } catch (error) {
        if (!panel.isConnected) return;
        applyProgress('Could not read saved Research Export checkpoints. Start and Fresh are disabled to avoid changing data. Check browser storage and reopen the exporter.');
      }
    })();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();
