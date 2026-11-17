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
  let log, startButton, scanButton, freshButton, cancelButton, limitInput, allBotsInput;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const phaseMs = Object.create(null);
  function addPhase(name, milliseconds) { phaseMs[name] = (phaseMs[name] || 0) + milliseconds; }
  function addWorkerMetrics(metrics) {
    if (!metrics) return;
    for (const [key, value] of Object.entries(metrics)) if (Number.isFinite(value)) addPhase(key, value);
  }
  async function measure(name, task) {
    const start = performance.now();
    try { return await task(); } finally { addPhase(name, performance.now() - start); }
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
    if (performance.now() - lastProgressAt >= 150) {
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
      }, 150);
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
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error || Error('Checkpoint failed'));
        if (method !== 'get') tx.onabort = () => reject(tx.error || Error('Checkpoint aborted'));
      });
    } finally { db.close(); addPhase(method === 'get' ? 'checkpointRead' : 'checkpointWrite', performance.now() - start); }
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
  async function newestBots(limit) {
    // An All-bots scan follows pagination until the API ends. Checkpoint page
    // progress to avoid starting from page one after cancellation or reload.
    const key = '__recent_bot_scan__';
    const prior = await withStore('get', key);
    // The global /v2/conversations endpoint uses the *character* ID as its
    // last_id cursor, unlike the per-bot conversation endpoint. Invalidate
    // earlier research checkpoints made with conversation IDs. Keep the
    // downloaded per-conversation histories and Memories untouched.
    const cursorScheme = 'global-character-id-v1';
    const resume = prior?.limit === limit && prior?.cursorScheme === cursorScheme &&
      Array.isArray(prior?.bots);
    const bots = resume ? prior.bots : [];
    const seenBots = new Set(bots.map(b => b.botId));
    const seenCursors = new Set(resume && Array.isArray(prior.cursors) ? prior.cursors : []);
    let lastId = resume ? String(prior.lastId || '') : '';
    let page = resume ? Number(prior.pages || 0) : 0;
    let done = resume && prior.state === 'complete';
    while (!done && (limit === 'all' || bots.length < limit)) {
      ensureNotCancelled();
      update(`Finding ${limit === 'all' ? 'all' : limit} recent bots: ${bots.length} found (${page} pages checked)...`);
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
  async function discoverSelection(limit) {
    update(`Finding ${limit === 'all' ? 'all available' : `the newest ${limit}`} distinct bots...`);
    const bots=await newestBots(limit);
    if(!bots.length)throw Error('No conversations found');
    const groups=[];
    for(let i=0;i<bots.length;i++) {
      ensureNotCancelled();
      const seed=bots[i],key=`__bot_scan_${seed.botId}`;
      update(`Checking bot ${i+1}/${bots.length} for additional conversations · ${seed.botName||seed.botId}`);
      let cached=await withStore('get',key);
      if (!cached || cached.state!=='complete' || !Array.isArray(cached.entries)) {
        const entries=await scanBotConversations(seed);
        cached={conversationId:key,state:'complete',entries,createdAt:Date.now()};
        await withStore('put',cached);
      }
      groups.push({botId:seed.botId,botName:seed.botName,entries:cached.entries});
      await sleep(300);
    }
    const selected=chooseAllBotConversations(groups);
    const discovery={mode:'per-bot-all-v2',scannedBots:groups.length,
      discoveredConversations:selected.length,
      multipleBots:groups.filter(g=>g.entries.length>1).map(g=>({botId:g.botId,name:g.botName,conversations:g.entries.length}))};
    const selection={conversationId:'__pilot_selection__',mode:'per-bot-all-v2',limit,entries:selected,discovery,createdAt:Date.now()};
    await withStore('put',selection);
    return selection;
  }
  async function readHistory(entry) {
    let lastId = '', pageSize = 100, first = true, complete = false, pages = 0;
    let expected = entry.expectedMessages, header = null;
    const byId = new Map(), seenCursors = new Set();
    while (pages < 2000) {
      ensureNotCancelled();
      let res;
      try { res = await retry(() => (DS.fetchChatHistoryPageShared || DS.fetchChatHistoryPage)(entry.botId, entry.conversationId, {limit:pageSize,lastId}), 'Chat history'); }
      catch (error) {
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
      }
      const parseStart = performance.now();
      for (let i = 0; i < rows.length; i++) {
        const message = rows[i];
        const id = String(message?.id || '');
        if (!id) throw Error('A message has no ID; cannot safely verify its order');
        const clean = safeRaw(message);
        if (byId.has(id)) {
          if (JSON.stringify(byId.get(id)) !== JSON.stringify(clean)) throw Error('Conflicting message content under one ID');
        } else byId.set(id, clean);
        if (i && i % 25 === 0) await sleep(0);
      }
      addPhase('historyParsing', performance.now() - parseStart);
      pages++; first = false;
      const oldest = rows.at(-1);
      if (!rows.length || (oldest && Object.hasOwn(oldest, 'prev_id') && !oldest.prev_id) || rows.length < pageSize) {
        complete = true; break;
      }
      const next = String(oldest?.id || '');
      if (!next || next === lastId || seenCursors.has(next)) throw Error('History pagination stopped advancing');
      seenCursors.add(next); lastId = next;
      await sleep(260);
    }
    const messages = [...byId.values()].reverse(); // API pages return newest first.
    // Native counts can include deleted and regenerated messages. Reaching
    // the API's normal pagination end, not equality with that counter,
    // determines whether the currently available history was read in full.
    return { messages, header, pages, expected, complete,
      countWarning: expected && expected !== messages.length ? `Listed ${expected}; API returned ${messages.length}` : null,
      error: !complete ? 'History page limit reached' : null };
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
    const manifest={format:'ds-chat-memory-research-v1',generatedAt:new Date().toISOString(),
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
    const blob=await archiveBlob(entries,partNumber,report);
    const filename=`spicychat-research-${runId}-part-${String(partNumber).padStart(3,'0')}.zip`;
    const after=Date.now();const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.download=filename;a.href=url;a.style.display='none';document.body.append(a);a.click();a.remove();
    let result={ok:false,status:'download-not-found'};
    for (let i=0;i<40;i++) {
      await sleep(1000);result=await measure('downloadVerification',()=>verifyRequest(filename,blob.size,after));
      if (result.ok || ['size-mismatch','download-verification-unavailable','downloads-permission-unavailable'].includes(result.status)) break;
    }
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    if (!result.ok) throw Error(`Part ${partNumber} download not verified (${result.status}). Check Downloads; the checkpoint remains resumable.`);
    return {filename,bytes:blob.size};
  }
  async function scanOnly(limit) {
    if (running) return;
    running=true;cancelled=false;
    startButton.disabled=true;freshButton.disabled=true;scanButton.disabled=true;
    cancelButton.disabled=false;setLimitDisabled(true);
    try {
      if (!DS.state?.settings?.enabled || !DS.state?.settings?.showBulkChatResearchExport)
        throw Error('Enable Research Export in QoL Settings first.');
      if (typeof DS.fetchConversationListPage !== 'function')throw Error('Conversation reader unavailable');
      const selection=await discoverSelection(limit);
      update(selectionNote(selection)+' Start / Resume to export.');
    } catch (error) {
      update(error?.message==='cancelled'?'Bot scan cancelled. Completed bot scans are saved for Resume.':
        `Bot scan stopped: ${error?.message||error}. Completed scans remain saved.`);
    } finally {
      running=false;startButton.disabled=false;freshButton.disabled=false;scanButton.disabled=false;
      cancelButton.disabled=true;setLimitDisabled(false);
    }
  }
  async function run(limit, fresh = false) {
    runId = crypto.randomUUID().replaceAll('-', ''); // Fresh filenames on each export, even in the same helper tab.
    running=true;cancelled=false;archiveWorkerDisabled=false;archiveBackend='not-started';for(const key of Object.keys(phaseMs))delete phaseMs[key];startButton.disabled=true;freshButton.disabled=true;scanButton.disabled=true;cancelButton.disabled=false;setLimitDisabled(true);
    let selected=[],saved=0;const completed=new Map();let completeCount=0;const memoryStatusCounts={};
    try {
      if (!DS.state?.settings?.enabled || !DS.state?.settings?.showBulkChatResearchExport) throw Error('Enable Research Export in QoL Settings first.');
      if (typeof DS.fetchConversationListPage !== 'function' || typeof DS.fetchChatHistoryPage !== 'function' ||
          typeof DS.researchReadConversationMemories !== 'function') throw Error('Required shared chat or Memory reader is unavailable.');
      update('Checking download verification permission...');
      if (!await DS.requestDownloadPermission?.()) throw Error('Downloads permission is needed to verify that ZIP parts actually saved.');
      if (fresh) {
        update('Starting a fresh download of chat history and native Memories...');
        await clearResearchCheckpoints();
      }
      const priorSelection = await withStore('get','__pilot_selection__');
      const selection = priorSelection?.mode==='per-bot-all-v2' && priorSelection?.limit===limit &&
        Array.isArray(priorSelection?.entries) && priorSelection?.discovery
        ? priorSelection : await measure('discovery',()=>discoverSelection(limit));
      selected=selection.entries;
      if (!selected.length) throw Error('No conversations found.');
      update(selectionNote(selection));
      const staged=[];let totalMessages=0,totalMemories=0,failed=0,historyFailed=0,partNumber=1;
      let memoryAuthFailures=0;
      const remainingFiles = new Map();
      const flush=async () => {
        if (!staged.length) return;
        ensureNotCancelled();
        const report={discovery:selection.discovery,selectedBots:selection.discovery.scannedBots,botSelection:limit,selectedConversations:selected.length,processedConversations:completed.size,
          conversationsInThisPart:[...new Set(staged.map(x=>x.conversationId))],messagesRead:totalMessages,memoriesRead:totalMemories,
          memoryFailures:failed,historyFailures:historyFailed,historyComplete:completeCount,
          memoryStatuses:{...memoryStatusCounts},
          incompleteConversations:[...new Set(staged.map(x=>x.conversationId))].filter(id=>{
            const record=completed.get(id);return record && (!record.historyComplete||record.memoryStatus==='unavailable'||!record.memoryComplete);
          })};
        update(`Saving and verifying archive part ${partNumber}...`);
        const info=await downloadPart(staged.map(x=>x.entry),partNumber,report);
        for (const id of new Set(staged.map(x=>x.conversationId))) {
          const count = staged.filter(x=>x.conversationId===id).length;
          const remaining = (remainingFiles.get(id) || 0) - count;
          remainingFiles.set(id, remaining);
          if (remaining > 0) continue; // No chat is complete until every part is verified.
          const row=completed.get(id);
          const old=await withStore('get',id);
          if (old && row) await withStore('put',{...old,state:row.memoryStatus==='unavailable'||row.memoryStatus==='not-checked'||!row.historyComplete||!row.memoryComplete?'verified-incomplete':'verified',lastVerifiedPart:info.filename});
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
        if (checkpoint?.state === 'verified' && checkpoint?.history?.complete &&
            Array.isArray(checkpoint.history.messages) &&
            ['retrieved', 'empty-confirmed'].includes(checkpoint?.memory?.status)) {
          // Rebuild EVERY requested archive from the locally saved verified
          // records. Download verification only proves an earlier ZIP saved;
          // it does not mean that file is still on the user's device.
          update(`Rebuilding ${index+1}/${selected.length} from saved chat data...`);
        }
        let historyError = null;
        if (!checkpoint?.history?.complete) {
          try {
            const history=await measure('historyReadTotal',()=>readHistory(entry));
            checkpoint={conversationId:entry.conversationId,entry,history,state:'staged',at:Date.now()};
          } catch (error) {
            if (cancelled) throw error;
            historyError=error;
            // Never claim missing data is a zero-message conversation.
            checkpoint={conversationId:entry.conversationId,entry,history:{messages:[],header:null,pages:0,
              expected:entry.expectedMessages,complete:false,error:'History API failed: '+String(error?.status || error?.message || 'unknown').slice(0,120)},
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
          checkpoint.memory={status:'not-checked',reason:'history-read-failed',items:null};
          ++historyFailed;
        }
        const history=checkpoint.history,memory=checkpoint.memory;
        totalMessages+=history.messages.length;
        if (Array.isArray(memory?.items)) totalMemories+=memory.items.length;
        else if (memory?.status === 'unavailable') {
          failed++;
          if (['auth-unavailable','auth-rejected','access-denied','unexpected-memory-format','invalid-json','not-enabled'].includes(memory.reason)) memoryAuthFailures++;
        }
        completed.set(entry.conversationId,{conversationId:entry.conversationId,historyComplete:history.complete,memoryStatus:memory.status,memoryComplete:!memoryNeedsResume(memory)});
        if (history.complete) completeCount++;
        memoryStatusCounts[memory.status]=(memoryStatusCounts[memory.status]||0)+1;
        // Keep unedited JSON and original message fields, including exact Markdown and timestamps.
        const fileList=[];
        fileList.push(await zippedEntry(`conversations/${entry.conversationId}/conversation.json`,{
          conversation:entry,history:{expected:history.expected,retrieved:history.messages.length,pages:history.pages,
            complete:history.complete,error:history.error,countWarning:history.countWarning||null,apiMetadata:history.header},
          memoryStatus:memory.status,memoryError:memory.reason||null,
          memoryPaginationComplete:!memoryNeedsResume(memory)}));
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
        await sleep(350);
      }
      await flush();
      update(`Export finished (${selection.discovery.scannedBots} bots, ${selected.length} conversations): ${totalMessages} messages, ${totalMemories} native Memories, ${saved} verified ZIP parts. ${failed} Memory reads unavailable, ${historyFailed} history reads failed.`);
    } catch (error) {
      update(error?.message==='cancelled' ? `Stopped. ${saved} archive parts verified; completed conversations remain locally checkpointed.` :
        `Stopped: ${error?.message||error}. ${saved} archive parts verified. Local checkpoints are preserved for Resume.`);
    } finally {
      stopArchiveWorker();
      if (progressTimer) {clearTimeout(progressTimer); progressTimer=null;}
      if (pendingProgress) {applyProgress(pendingProgress);pendingProgress='';}
      console.info('[DragonScript Research Export] Archive backend:',archiveBackend,'Phase timings (ms; API phases include network pacing):', {...phaseMs});
      running=false;startButton.disabled=false;freshButton.disabled=false;scanButton.disabled=false;cancelButton.disabled=true;setLimitDisabled(false);
    }
  }
  function setLimitDisabled(busy) {
    limitInput.disabled = busy || allBotsInput.checked;
    allBotsInput.disabled = busy;
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
    if (limit==='all' && !window.confirm('Scan all available bots and their conversations? This may take a long time and create many ZIP files. You can cancel and resume.')) return;
    if (fresh && !window.confirm('Download all selected conversations and native Memories again from SpicyChat? This clears only the research exporter’s local checkpoints. Previously saved ZIP files are not removed.')) return;
    void (action==='scan' ? scanOnly(limit) : run(limit,fresh));
  }
  function render() {
    if(document.getElementById('ds-bulk-research-panel')) return;
    const panel=document.createElement('section');panel.id='ds-bulk-research-panel';
    panel.style.cssText='position:fixed;z-index:2147483000;right:10px;top:70px;width:min(540px,calc(100vw - 20px));box-sizing:border-box;max-height:80vh;overflow-y:auto;overflow-x:hidden;padding:12px 14px;background:#181a22;color:#f5f5f5;border:1px solid #777;border-radius:12px;box-shadow:0 5px 35px #000a;font:13px/1.4 sans-serif';
    const title=document.createElement('h3');title.textContent='Bulk Chat & Memory Research Export';title.style.cssText='margin:0 0 6px;font-size:17px;line-height:1.3';panel.append(title);
    const hint=document.createElement('p');hint.textContent='Export every chat and native Memory for the selected bots. ZIPs split at 300 MB. Your chats are unchanged.';hint.style.cssText='margin:0 0 8px';panel.append(hint);
    const selectors=document.createElement('div');selectors.style.cssText='display:flex;align-items:center;gap:12px;flex-wrap:wrap';
    const label=document.createElement('label');label.textContent='Recent bots to export ';label.style.whiteSpace='nowrap';
    limitInput=document.createElement('input');limitInput.type='number';limitInput.min='1';limitInput.step='1';limitInput.value=String(DEFAULT_BOTS);limitInput.style.cssText='width:65px;color:black';label.append(limitInput);selectors.append(label);
    const allLabel=document.createElement('label');allLabel.style.cssText='display:flex;align-items:center;gap:6px;white-space:nowrap';
    allBotsInput=document.createElement('input');allBotsInput.type='checkbox';allLabel.append(allBotsInput,document.createTextNode('All bots'));selectors.append(allLabel);panel.append(selectors);
    allBotsInput.addEventListener('change',()=>setLimitDisabled(false));
    const buttons=document.createElement('div');buttons.style.cssText='display:flex;flex-wrap:nowrap;overflow-x:auto;gap:6px;margin:9px 0;max-width:100%;white-space:nowrap;scrollbar-width:thin';
    startButton=document.createElement('button');startButton.textContent='Start / Resume';
    scanButton=document.createElement('button');scanButton.textContent='Scan bots';scanButton.title='Scan selected bots for additional conversations';
    freshButton=document.createElement('button');freshButton.textContent='Fresh';freshButton.title='Download chats and Memories again, clearing only research checkpoints';freshButton.setAttribute('aria-label','Download fresh');
    cancelButton=document.createElement('button');cancelButton.textContent='Cancel';cancelButton.disabled=true;
    const close=document.createElement('button');close.textContent='Close';
    for(const b of [startButton,scanButton,freshButton,cancelButton,close]) b.style.cssText='flex:0 0 auto;padding:6px 6px;border-radius:6px;background:#343e5e;color:white;cursor:pointer;white-space:nowrap;font:12px sans-serif';
    buttons.append(startButton,scanButton,freshButton,cancelButton,close);panel.append(buttons);
    log=document.createElement('pre');log.textContent='Ready. Check that QoL Settings has Research Export enabled.';
    log.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0;font:12px/1.5 monospace';log.setAttribute('role','status');panel.append(log);
    startButton.addEventListener('click',()=>launch('export'));
    scanButton.addEventListener('click',()=>launch('scan'));
    freshButton.addEventListener('click',()=>launch('export',true));
    cancelButton.addEventListener('click',()=>{cancelled=true;cancelButton.disabled=true;stopArchiveWorker('cancelled');update('Stopping export; local checkpoints are preserved...');});
    close.addEventListener('click',()=>{if(running){update('Cancel the export before closing.');return;}panel.remove();});
    document.documentElement.append(panel);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();
