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
  let cancelled = false, running = false;
  let log, startButton, scanButton, quickScanButton, freshButton, cancelButton, limitInput, allBotsInput, characterRetryInput;
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
  function openDb() {
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
        const request = method === 'get' ? store.get(data) : store.put(data);
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
      db.close();
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
    } finally { db.close(); }
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
          found.add(item.botId); item.recentHead = true; recent.push(item);
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
    // Normal scan reads the recent head of the global list, then rechecks
    // the newest 120 bots and uncached bots; Full scan is exhaustive.
    const QUICK_SCAN_RECENT_BOTS = 120;
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
      const mustRefresh = refresh && (!quick || i < QUICK_SCAN_RECENT_BOTS || (seed.recentHead && !priorEntries?.length));
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
    return selection;
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
  async function readHistory(entry, previous = null) {
    let lastId = '', pageSize = 100, first = true, complete = false, pages = 0;
    let expected = entry.expectedMessages, header = null;
    const anchor = verifiedHistoryAnchor(previous);
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
        if (anchor && rows.length === 0) throw Error('History API returned an empty page for a saved chat; existing checkpoint kept');
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
    // The previously saved newest ID disappeared (deleted/regenerated) or
    // history was never completed. Finish the normal full read, never stitch
    // mismatched pagination chains together or silently mark an old history
    // as current. Preserve orphaned checkpoint records separately so nothing
    // saved locally is erased by a full reconciliation.
    const fetchedIds = anchor && previous ? new Set(fetched.map(message => String(message.id))) : null;
    const orphaned = fetchedIds ? previous.messages.filter(message => !fetchedIds.has(String(message.id))) : [];
    const savedIds = anchor && previous ? new Set(previous.messages.map(message => String(message.id))) : null;
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
      sync: {mode: anchor ? 'full-reconcile-missing-anchor' : 'initial-full',
        checkedAt, fetchedPages: pages, added: savedIds ? fetched.filter(m => !savedIds.has(String(m.id))).length : fetched.length,
        updated: 0, anchorFound: !anchor},
      countWarning: expected && expected !== fetched.length ? `Listed ${expected}; API returned ${fetched.length}` : null,
      error: null
    };
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
    for (let i=0; i<bytes.length; i+=131072) {
      const stop=Math.min(i+131072,bytes.length);
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
      if(i && i%12===0){ensureNotCancelled();await sleep(0);}
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
      if(i && i%32===0){ensureNotCancelled();await sleep(0);}
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
  // GitHub is opt-in and runs only AFTER every Research Export ZIP part was
  // verified. It reads already saved checkpoints, never sends new API calls,
  // and does not affect the existing ZIP worker, cancellation or checkpoints.
  async function githubResearchStageRecord(key,record,runToken) {
    const serialized=JSON.stringify({schema:'dsq-research-record-v1',key,complete:true,...record});
    if(serialized.length>79_000_000)throw Error('Verified research record exceeds safe GitHub staging limit');
    const chunkSize=110000,total=Math.ceil(serialized.length/chunkSize);
    if(total>1000)throw Error('Too many Research Export staging chunks');
    for(let i=0;i<total;i++){
      const response=await new Promise(resolve=>chrome.runtime.sendMessage({
        type:'DS_GITHUB_BACKUP_RESEARCH_STAGE',recordKey:key,job:runToken,
        part:i,total,data:serialized.slice(i*chunkSize,(i+1)*chunkSize)
      },r=>resolve(chrome.runtime.lastError?{ok:false,error:chrome.runtime.lastError.message}:r)));
      if(!response?.ok)throw Error(String(response?.error||'GitHub research staging unavailable'));
      if(i%5===0)await sleep(0);
    }
  }
  async function stageVerifiedResearchGithub(selection,characters,completedRunId){
    let config;
    try{config=(await chrome.storage.local.get('dsGithubBackupPrefsV1')).dsGithubBackupPrefsV1;}catch{return;}
    if(!config||!['github','both'].includes(config.provider)||!config.categories?.includes('research')||!config.repository||config.paused)return;
    let staged=0,skipped=0;
    const visitedCharacters=new Set();
    for(const entry of selection){
      // Only verified complete records are eligible. A failed/cancelled
      // export never stages missing or partial data as deletion.
      let checkpoint;
      try{checkpoint=await withStore('get',entry.conversationId);}catch{skipped++;continue;}
      if(checkpoint?.state!=='verified'||!checkpoint.history?.complete||!Array.isArray(checkpoint.history.messages)||
          ['unavailable','not-checked'].includes(checkpoint.memory?.status)){skipped++;continue;}
      const history=checkpoint.history;
      const stableHistory={messages:history.messages,complete:true,expected:history.expected,
        header:history.header,orphanedMessages:history.orphanedMessages||[]};
      const nativeMemories={status:checkpoint.memory.status,paginationComplete:true,
        memories:checkpoint.memory.items||[],reason:checkpoint.memory.reason||null};
      const story=collectResearchStoryData(entry,history);
      try{
        await githubResearchStageRecord(`conversation:${entry.conversationId}`,{
          botId:entry.botId,conversationId:entry.conversationId,history:stableHistory,
          nativeMemories,rulebookStates:story.rulebook,storyMoments:story.moments,
          oocDirectives:story.ooc},completedRunId);
        staged++;
      }catch(error){skipped++;console.warn('[QoL GitHub Research] Verified conversation staging failed:',entry.conversationId,String(error?.message||error));}
      if(!visitedCharacters.has(entry.botId)){
        visitedCharacters.add(entry.botId);
        const character=characters.get(entry.botId);
        const incomplete=character?.linkedLorebooks?.some(b=>
          (b.status==='present'||b.status==='empty') && b.paginationComplete===false);
        // Never downgrade an earlier complete character/Lorebook with a
        // temporary API-empty record or an incomplete pagination response.
        if(character?.fetchStatus==='present'&&!incomplete){
          const stable={...character};
          delete stable.fetchedAt;delete stable.lastRefreshError;
          try{await githubResearchStageRecord(`character:${entry.botId}`,{
            botId:entry.botId,character:stable},completedRunId);staged++;}
          catch(error){skipped++;console.warn('[QoL GitHub Research] Character staging failed:',entry.botId,String(error?.message||error));}
        }
      }
      if(staged%8===0)await sleep(0);
    }
    try{chrome.runtime.sendMessage({type:'DS_GITHUB_BACKUP_RESEARCH_FINISH',staged,skipped},()=>void chrome.runtime.lastError);}
    catch{}
    console.info('[QoL GitHub Research] Verified checkpoint staging:',{staged,skipped});
  }
  async function scanOnly(limit, quick = true) {
    if (running) return;
    running=true;cancelled=false;progressBegin('scan');
    startButton.disabled=true;freshButton.disabled=true;scanButton.disabled=true;quickScanButton.disabled=true;
    cancelButton.disabled=false;setLimitDisabled(true);
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
      running=false;startButton.disabled=false;freshButton.disabled=false;scanButton.disabled=false;quickScanButton.disabled=false;
      cancelButton.disabled=true;setLimitDisabled(false);
    }
  }
  async function run(limit, fresh = false) {
    runId = crypto.randomUUID().replaceAll('-', ''); // Fresh filenames on each export, even in the same helper tab.
    characterReadCircuit=null;lorebookReadCircuit=null;linkedLorebookRunCache.clear();
    running=true;cancelled=false;progressBegin('export');archiveWorkerDisabled=false;archiveBackend='not-started';
    for (const key of Object.keys(phaseMs)) { delete phaseMs[key]; delete phaseCount[key]; delete phaseMaxMs[key]; }
    const exportOp = DS.isDiagnosticTraceActive?.('normal') ? DS.diagOperationStart?.('research-export','run-resumable-archive', {
      trigger: 'user-start', reason: fresh ? 'explicit-fresh-export' : 'resume-or-rebuild-export',
      phase: 'discover-retrieve-pack-verify', parentOperationId: ''
    }) : null;
    let exportOutcome = 'completed';
    startButton.disabled=true;freshButton.disabled=true;scanButton.disabled=true;quickScanButton.disabled=true;cancelButton.disabled=false;setLimitDisabled(true);
    let selected=[],saved=0;const completed=new Map();let completeCount=0;const memoryStatusCounts={};
    const characterByBot=new Map(),characterPartByBot=new Map(),characterStatusCounts={},characterErrors=[];
    try {
      if (!DS.state?.settings?.enabled || !DS.state?.settings?.showBulkChatResearchExport) throw Error('Enable Research Export in QoL Settings first.');
      if (typeof DS.fetchConversationListPage !== 'function' || typeof DS.fetchChatHistoryPage !== 'function' ||
          typeof DS.researchReadConversationMemories !== 'function') throw Error('Required shared chat or Memory reader is unavailable.');
      update('Checking Downloads permission (a browser permission prompt can make this wait; it is not ZIP CPU time)...');
      if (!await measure('downloadPermission',()=>DS.requestDownloadPermission?.())) throw Error('Downloads permission is needed to verify that ZIP parts actually saved.');
      if (fresh) {
        update('Starting a fresh download of chat history, native Memories and character metadata...');
        await clearResearchCheckpoints();
      }
      const priorSelection = await measure('selectionCheckpointRead',()=>withStore('get','__pilot_selection__'));
      const selection = priorSelection?.mode==='per-bot-all-v2' && priorSelection?.limit===limit &&
        Array.isArray(priorSelection?.entries) && priorSelection?.discovery
        ? priorSelection : await measure('discovery',()=>discoverSelection(limit));
      selected=selection.entries;
      progressStage('export',selected.length,`0/${selected.length} conversations processed`);
      if (!selected.length) throw Error('No conversations found.');
      update(selectionNote(selection));
      const staged=[];let totalMessages=0,totalMemories=0,failed=0,historyFailed=0,partNumber=1;
      let rulebookStateChats=0,storyMomentChats=0,oocDirectiveCount=0;
      let memoryAuthFailures=0;
      const remainingFiles = new Map();
      const flush=async () => {
        if (!staged.length) return;
        ensureNotCancelled();
        const report={discovery:selection.discovery,selectedBots:selection.discovery.scannedBots,botSelection:limit,selectedConversations:selected.length,processedConversations:completed.size,
          conversationsInThisPart:[...new Set(staged.map(x=>x.conversationId).filter(Boolean))],messagesRead:totalMessages,memoriesRead:totalMemories,
          memoryFailures:failed,historyFailures:historyFailed,historyComplete:completeCount,
          memoryStatuses:{...memoryStatusCounts},
          storyExport:{rulebookStateChats,storyMomentChats,oocDirectiveCount,
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
          incompleteConversations:[...new Set(staged.map(x=>x.conversationId).filter(Boolean))].filter(id=>{
            const record=completed.get(id);return record && (!record.historyComplete||record.memoryStatus==='unavailable'||!record.memoryComplete);
          })};
        update(`Saving and verifying archive part ${partNumber}...`);
        const info=await measure('zipBuildAndDownloadTotal',()=>downloadPart(staged.map(x=>x.entry),partNumber,report));
        renderPhaseTimings();
        for (const id of new Set(staged.map(x=>x.conversationId).filter(Boolean))) {
          const count = staged.filter(x=>x.conversationId===id).length;
          const remaining = (remainingFiles.get(id) || 0) - count;
          remainingFiles.set(id, remaining);
          if (remaining > 0) continue; // No chat is complete until every part is verified.
          const row=completed.get(id);
          const old=await withStore('get',id);
          if (old && row) await withStore('put',{...old,
            history:old.history && row.historyComplete ? {...old.history,
              lastVerifiedMessageId:String(old.history.messages?.at(-1)?.id||''),
              lastVerifiedAt:Date.now()} : old.history,
            state:row.memoryStatus==='unavailable'||row.memoryStatus==='not-checked'||!row.historyComplete||!row.memoryComplete?'verified-incomplete':'verified',lastVerifiedPart:info.filename});
        }
        saved++;staged.length=0;partNumber++;
      };
      let partSize=0;
      for (let index=0;index<selected.length;index++) {
        ensureNotCancelled();const entry=selected[index];
        update(`Conversation ${index+1}/${selected.length} · ${entry.botName||'Chat'} · ${totalMessages} messages · ${totalMemories} Memories · ${saved} saved parts`);
        let checkpoint=await withStore('get',entry.conversationId);
        if (wasLegacyCountOnlyMismatch(checkpoint)) {
          // Keep downloaded message and Memory records; rebuild only the
          // corrected ZIP metadata from the local checkpoint on Resume.
          checkpoint={...checkpoint,history:{...checkpoint.history,complete:true,error:null}};
          await withStore('put',checkpoint);
          update(`Reusing saved chat data for ${index+1}/${selected.length}; correcting a message-count warning`);
        }
        // Start / Resume always checks the newest history page. A valid
        // history checkpoint stops pagination at its most recently saved ID;
        // only Fresh explicitly clears and downloads every old page again.
        let historyError = null;
        const savedHistory = checkpoint?.history;
        try {
          const history=await measure('historyReadTotal',()=>readHistory(entry,savedHistory));
          const sync=history.sync || {};
          if (sync.mode === 'catch-up') {
            update(`Caught up conversation ${index+1}/${selected.length}: +${sync.added||0} messages, ${sync.updated||0} refreshed · ${sync.fetchedPages||0} pages checked`);
          } else if (sync.mode === 'full-reconcile-missing-anchor') {
            update(`Re-read conversation ${index+1}/${selected.length}: previous latest message no longer exists; saved missing records retained locally`);
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
      progressFinish();
      renderPhaseTimings();
      const failedCharacters=characterStatusCounts.fetch_failed||0;
      const incompleteLorebooks=characterErrors.filter(error=>error.scope==='lorebook' &&
        /pagination incomplete/i.test(String(error.reason||''))).length;
      update(`Export finished (${selection.discovery.scannedBots} bots, ${selected.length} conversations): ${characterByBot.size} character records, ${totalMessages} messages, ${totalMemories} native Memories, Rulebook data for ${rulebookStateChats} chats, Story Moments data for ${storyMomentChats}, ${oocDirectiveCount} explicit OOC directives, ${saved} verified ZIP parts. ${failedCharacters} character fetch failures, ${incompleteLorebooks} incomplete Lorebooks, ${characterErrors.length} total metadata issues; ${failed} Memory reads unavailable, ${historyFailed} history reads failed.`);
      // Nonblocking optional post-export handoff: native ZIP verification already succeeded.
      setTimeout(()=>void stageVerifiedResearchGithub(selected,characterByBot,runId).catch(error=>
        console.warn('[QoL GitHub Research] Optional staging stopped; original ZIP/checkpoints are safe:',error?.message||error)),150);
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
      running=false;startButton.disabled=false;freshButton.disabled=false;scanButton.disabled=false;quickScanButton.disabled=false;cancelButton.disabled=true;setLimitDisabled(false);
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
    if (running) return;
    let limit;
    try { limit=chosenLimit(); } catch (error) { update(error.message); return; }
    if (limit==='all' && action==='scan-full' && !window.confirm('Full scan will recheck ALL bots and conversations, potentially taking hours. Continue?')) return;
    if (limit==='all' && (action==='export' || action==='fresh') && !window.confirm('Export all saved conversations? This may take a long time and create many ZIP parts. Continue?')) return;
    if (fresh && !window.confirm('Download all selected conversations, native Memories and character metadata again? This clears only the research exporter’s local checkpoints. Previously downloaded ZIP files are not removed.')) return;
    void (action==='scan' ? scanOnly(limit, true) : action==='scan-full' ? scanOnly(limit, false) : run(limit,fresh));
  }
  function render() {
    if(document.getElementById('ds-bulk-research-panel')) return;
    const panel=document.createElement('section');panel.id='ds-bulk-research-panel';
    panel.style.cssText='position:fixed;z-index:2147483000;right:10px;top:70px;width:min(540px,calc(100vw - 20px));box-sizing:border-box;max-height:80vh;overflow-y:auto;overflow-x:hidden;padding:12px 14px;background:#181a22;color:#f5f5f5;border:1px solid #777;border-radius:12px;box-shadow:0 5px 35px #000a;font:13px/1.4 sans-serif';
    const title=document.createElement('h3');title.textContent='Bulk Chat, Memory & Character Research Export';title.style.cssText='margin:0 0 6px;font-size:17px;line-height:1.3';panel.append(title);
    const hint=document.createElement('p');hint.textContent='Start / Resume updates saved chats. Scan bots now discovers recent chats and rechecks the newest 120 bots, preserving older cached conversations; this is much faster but may miss new chats under older bots. Full scan exhaustively checks every bot when needed. Fresh re-downloads saved histories; Memories and Lorebooks are handled separately.';hint.style.cssText='margin:0 0 8px';panel.append(hint);
    const selectors=document.createElement('div');selectors.style.cssText='display:flex;align-items:center;gap:12px;flex-wrap:wrap';
    const label=document.createElement('label');label.textContent='Recent bots to export ';label.style.whiteSpace='nowrap';
    limitInput=document.createElement('input');limitInput.type='number';limitInput.min='1';limitInput.step='1';limitInput.value=String(DEFAULT_BOTS);limitInput.style.cssText='width:65px;color:black';label.append(limitInput);selectors.append(label);
    const allLabel=document.createElement('label');allLabel.style.cssText='display:flex;align-items:center;gap:6px;white-space:nowrap';
    allBotsInput=document.createElement('input');allBotsInput.type='checkbox';allLabel.append(allBotsInput,document.createTextNode('All bots'));selectors.append(allLabel);panel.append(selectors);
    allBotsInput.addEventListener('change',()=>setLimitDisabled(false));
    const charRow=document.createElement('label');charRow.style.cssText='display:flex;align-items:center;gap:6px;margin:6px 0;flex-wrap:wrap';
    charRow.append(document.createTextNode('Character metadata: '));
    characterRetryInput=document.createElement('select');characterRetryInput.title='Reuse character checkpoints, retry failed or incomplete linked Lorebooks, or refresh all bots. Successful snapshots auto-refresh after seven days.';
    for (const [value,name] of [['reuse','Reuse cached / update stale'],['retry-failed','Retry failed / incomplete'],['refresh','Refresh all character metadata']]) {
      const option=document.createElement('option');option.value=value;option.textContent=name;characterRetryInput.append(option);
    }
    characterRetryInput.style.cssText='max-width:100%;background:#343e5e;color:white;padding:4px;border-radius:5px';
    charRow.append(characterRetryInput);panel.append(charRow);

    const buttons=document.createElement('div');buttons.style.cssText='display:flex;flex-wrap:nowrap;overflow-x:auto;gap:6px;margin:9px 0;max-width:100%;white-space:nowrap;scrollbar-width:thin';
    startButton=document.createElement('button');startButton.textContent='Start / Resume';
    scanButton=document.createElement('button');scanButton.textContent='Scan bots';scanButton.title='Incremental: scan recent bot/chat changes and reuse older verified scans';
    quickScanButton=document.createElement('button');quickScanButton.textContent='Full scan';quickScanButton.title='Exhaustive: query all bots and all their conversations (may take hours)';
    freshButton=document.createElement('button');freshButton.textContent='Fresh';freshButton.title='Download all chats, Memories and character metadata again, clearing only research checkpoints';freshButton.setAttribute('aria-label','Download fresh');
    cancelButton=document.createElement('button');cancelButton.textContent='Cancel';cancelButton.disabled=true;
    const close=document.createElement('button');close.textContent='Close';
    // Restore the previous scan scope before accepting Start / Resume.
    // Without this guard the UI defaults to 50 after a reload, even if the
    // saved checkpoint covered thousands of bots or All bots.
    startButton.disabled=true;scanButton.disabled=true;quickScanButton.disabled=true;freshButton.disabled=true;
    for(const b of [startButton,quickScanButton,scanButton,freshButton,cancelButton,close]) b.style.cssText='flex:0 0 auto;padding:6px 6px;border-radius:6px;background:#343e5e;color:white;cursor:pointer;white-space:nowrap;font:12px sans-serif';
    buttons.append(startButton,quickScanButton,scanButton,freshButton,cancelButton,close);panel.append(buttons);
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
    freshButton.addEventListener('click',()=>launch('export',true));
    cancelButton.addEventListener('click',()=>{cancelled=true;cancelButton.disabled=true;stopArchiveWorker('cancelled');update('Stopping export; local checkpoints are preserved...');});
    close.addEventListener('click',()=>{if(running){update('Cancel the export before closing.');return;}panel.remove();});
    document.documentElement.append(panel);
    setLimitDisabled(true);
    // This is a single IndexedDB read on panel creation, not polling or a
    // background scan. If no completed selection exists, recover the scope
    // of an interrupted bot discovery from its checkpoint instead.
    void (async () => {
      try {
        const selection = await withStore('get','__pilot_selection__');
        const savedScan = selection?.limit == null ? await withStore('get','__recent_bot_scan__') : null;
        if (!panel.isConnected) return;
        const priorLimit = selection?.limit ?? savedScan?.limit;
        if (priorLimit === 'all') allBotsInput.checked = true;
        else if (Number.isSafeInteger(priorLimit) && priorLimit > 0) limitInput.value = String(priorLimit);
        setLimitDisabled(false);
        const count = Array.isArray(selection?.entries) ? selection.entries.length : null;
        applyProgress(count !== null
          ? `Restored selection: ${count} conversations. Start / Resume checks new replies; Scan bots discovers new conversations.`
          : 'Ready. Start / Resume uses saved checkpoints; Scan bots discovers new conversations.');
        startButton.disabled=false;scanButton.disabled=false;quickScanButton.disabled=false;freshButton.disabled=false;
      } catch (error) {
        if (!panel.isConnected) return;
        applyProgress('Could not read saved Research Export checkpoints. Start and Fresh are disabled to avoid changing data. Check browser storage and reopen the exporter.');
      }
    })();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();
