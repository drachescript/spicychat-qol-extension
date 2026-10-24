// v0.2.57 opt-in, owned/private bot -> owned/private attached Lorebook bridge.
// The Archive Lorebook is STORAGE ONLY, never attached or suggested for attachment.
// Existing-entry updates/deletion remain native-editor-reviewed until the request contract is verified.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  const local = DS?.privateLorebookStorage;
  const recovery = DS?.privateLorebookRecovery;
  if (!DS || !local || !recovery) return;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const BASE = 'https://prod.nd-api.com';
  const PENDING = 'dsQolPrivateLorebookNativeQueueV1';
  const MODAL = 'ds-private-lorebook-bridge';
  const BUTTON = 'ds-private-lorebook-bridge-launch';
  const norm = (value, n = 2000) => String(value ?? '').replace(/\u00a0/g, ' ').trim().slice(0, n);
  const settings = () => DS.state?.settings || {};
  const node = (tag, text, className) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; };
  const scope = () => {
    const result = DS.getCurrentChatScope?.();
    if (!result?.persisted || !UUID.test(result.botId) || !UUID.test(result.conversationId)) return null;
    return {botId: result.botId.toLowerCase(), conversationId: result.conversationId.toLowerCase()};
  };
  const sameRoute = expected => { const now = scope(); return !!now && now.botId === expected.botId && now.conversationId === expected.conversationId; };
  function sortedUniqueKeywords(value) {
    return [...new Map(String(value || '').split(',').map(item => norm(item,80)).filter(Boolean)
      .map(item => [item.toLowerCase(), item])).values()].slice(0, 12);
  }
  function validateEntry({name, content, keywords}) {
    if (!norm(name,50) || !norm(content,2000)) throw new Error('Entry name and content are required.');
    if (String(name).trim().length > 50 || String(content).trim().length > 2000) throw new Error('Name/content exceeds native Lorebook limits.');
    const values = Array.isArray(keywords) ? keywords : sortedUniqueKeywords(keywords);
    if (!values.length) throw new Error('Add at least one specific keyword before promoting an entry.');
    if (values.length > 12 || values.some(x=>!norm(x,80))) throw new Error('Invalid keywords.');
    const tooBroad = new Set(['the','and','she','he','they','you','me','i','it','a','an','is','her','him','their','this','that','room','house','home','day','night','story','user']);
    if (values.some(x=>tooBroad.has(x.toLowerCase()))) throw new Error('Replace broad keywords with distinctive names or phrases.');
    return {name:norm(name,50), keywords:values.map(x=>norm(x,80)),content:norm(content,2000)};
  }
  async function api(path, method='GET', payload) {
    const request=DS.privateLorebookAuth?.request;
    if(typeof request!=='function')throw new Error('Private Lorebook authentication helper is unavailable. No changes allowed.');
    return request(path,method,payload);
  }
  async function identity() {
    const data = await api('/v2/users');
    const id = norm(data?.user?.id,150);
    if (!id) throw new Error('Could not verify the signed-in user. No changes allowed.');
    return id;
  }
  function firstId(items) {
    if (!Array.isArray(items) || items.length !== 1 || !UUID.test(items[0]?.id)) return null;
    return items[0].id.toLowerCase();
  }
  async function verifyBot(s) {
    const accountId = await identity();
    const character = await api(`/v2/characters/${s.botId}?include=rulebook`);
    // 'hidden' is the native private-chatbot visibility in the captured v4.7.3 creator flow.
    if (String(character?.id).toLowerCase() !== s.botId || !['hidden','private'].includes(character?.visibility)) {
      throw new Error('This bot is not verified as private/hidden and owned.');
    }
    if (character?.creator_user_id !== accountId) throw new Error('This bot belongs to another creator.');
    const bookId = firstId(character.lorebooks);
    if (!bookId) throw new Error('The bot must have exactly one verifiable attached Lorebook.');
    const book = await api(`/lorebooks/${bookId}?sortBy=priority&lastSortPriority=0`);
    if (String(book?.id).toLowerCase() !== bookId || book.creator_user_id !== accountId || book.visibility !== 'private') {
      throw new Error('The attached Lorebook is not verified private and owned by this account.');
    }
    if (!sameRoute(s)) throw new Error('You changed conversations during verification.');
    return {accountId, bookId, book, character};
  }
  async function verifyArchive(accountId, targetId, attachedId) {
    if (!UUID.test(targetId) || targetId.toLowerCase() === attachedId) throw new Error('Choose a separate Archive Lorebook that is not connected to any bot.');
    const book = await api(`/lorebooks/${targetId.toLowerCase()}?sortBy=priority&lastSortPriority=0`);
    if (String(book?.id).toLowerCase() !== targetId.toLowerCase() || book.creator_user_id !== accountId || book.visibility !== 'private') {
      throw new Error('Archive Lorebook ownership or private visibility could not be verified.');
    }
    if (!Number.isInteger(book.numAttachedCharacters) || book.numAttachedCharacters !== 0) {
      throw new Error('The Archive Lorebook must not be connected to any bot (unable to verify).');
    }
    if (Number(book.num_entries) >= 5000) throw new Error('The Archive Lorebook has reached its entry limit.');
    return book;
  }
  // A read-only integrity check. The native Lorebook endpoint may return a
  // *page* of entries: never label an entry missing unless all pages are present.
  // This does not clear pending markers or mutate either storage backend.
  function inspectArchiveRecords(records, archive, s) {
    const entries = Array.isArray(archive?.entries) ? archive.entries : null;
    const expectedCount = archive?.num_entries;
    const complete = entries !== null && Number.isSafeInteger(expectedCount) && expectedCount >= 0 &&
      entries.length === expectedCount && new Set(entries.map(item=>String(item?.id||'').toLowerCase())).size === expectedCount;
    const byId = new Map((entries || []).filter(item=>UUID.test(item?.id)).map(item=>[String(item.id).toLowerCase(),item]));
    const result = {total: records.length, verified:0, changed:0, missing:0, incomplete:0,
      pending:0, localOnly:0, otherBook:0, unreadable:0, complete, remoteCount:entries?.length ?? null,
      expectedCount:Number.isSafeInteger(expectedCount)?expectedCount:null};
    for (const record of records) {
      const remote = record?.remote;
      if (remote?.status === 'pending') {result.pending++;continue;}
      if (!remote?.id) {result.localOnly++;continue;}
      if (String(remote.bookId||'').toLowerCase() !== String(archive.id||'').toLowerCase()) {
        result.otherBook++;continue;
      }
      if (!entries) {result.incomplete++;continue;}
      const stored = byId.get(String(remote.id).toLowerCase());
      if (!stored) {if (complete) result.missing++;else result.incomplete++;continue;}
      if (typeof stored.content !== 'string') {result.unreadable++;continue;}
      let data;
      try {data=JSON.parse(stored.content);} catch {result.changed++;continue;}
      if (!['dsq-lorebook-archive/v1','dsq-lorebook-archive/v2'].includes(data?.schema) ||
          data.botId !== s.botId || data.conversationId !== s.conversationId ||
          data.detailId !== record.detailId || data.content !== record.content) {
        result.changed++;
      } else result.verified++;
    }
    return result;
  }
  function archiveAuditSummary(result) {
    const segments = [`${result.verified} verified`,`${result.localOnly} local-only`,
      `${result.pending} pending`,`${result.changed} changed`,`${result.missing} missing`,
      `${result.incomplete} not verifiable from the loaded page`];
    if (result.otherBook) segments.push(`${result.otherBook} linked to another Archive`);
    if (result.unreadable) segments.push(`${result.unreadable} not readable`);
    return `Read-only Archive audit (${result.total} local records): ${segments.join(', ')}. `+
      (result.complete ? 'All remote entries were available for comparison.' :
        'SpicyChat supplied only a partial entry list or no entries; unlisted records are NOT counted as deleted.')+
      ' Pending and mismatched records are never retried or overwritten by this check.';
  }
  // Read-only preview for *potential* Archive cleanup. A remotely uploaded
  // Archive record is not redundant just because a local native handoff was
  // queued: require two concrete native entry IDs and compare both readbacks.
  function inspectArchiveCleanup(records, archive, attached, s, factMap) {
    const archives=new Map((Array.isArray(archive?.entries)?archive.entries:[])
      .filter(row=>UUID.test(row?.id)).map(row=>[String(row.id).toLowerCase(),row]));
    const natives=new Map((Array.isArray(attached?.entries)?attached.entries:[])
      .filter(row=>UUID.test(row?.id)).map(row=>[String(row.id).toLowerCase(),row]));
    // A partial entry page is never sufficient evidence for safe cleanup.
    // Even a matching entry cannot certify uniqueness if the rest are hidden.
    const complete = [archive,attached].every(book => {
      const count=book?.num_entries;
      return Array.isArray(book?.entries) && Number.isSafeInteger(count) && count>=0 &&
        book.entries.length===count && new Set(book.entries.map(item=>String(item?.id||'').toLowerCase())).size===count;
    });
    const result={total:records.length,eligible:[],notVerifiable:0,notPromoted:0,conflicts:0,complete};
    for(const record of records) {
      const remote=record?.remote,native=record?.native;
      const fact=factMap?.get(record?.detailId);
      if (!record?.sourceText || !fact || fact.enabled===false || fact.needsReview ||
          fact.supersededBy || String(fact.text||'').trim()!==record.sourceText) {
        result.notPromoted++;continue;
      }
      if(!UUID.test(remote?.id) || remote.status!=='confirmed' || remote.stale===true ||
         String(remote.bookId||'').toLowerCase()!==String(archive?.id||'').toLowerCase() ||
         !UUID.test(native?.id) || native.verifiedCreated!==true || native.stale===true ||
         String(native.bookId||'').toLowerCase()!==String(attached?.id||'').toLowerCase()) {
        result.notPromoted++;continue;
      }
      if(!complete) {result.notVerifiable++;continue;}
      const archived=archives.get(String(remote.id).toLowerCase());
      const saved=natives.get(String(native.id).toLowerCase());
      if(!archived || !saved || typeof saved.content!=='string') {
        result.notVerifiable++;continue; // May be a paginated response, not a deletion.
      }
      const parsed=recovery.parse(archived,s);
      if(!parsed || parsed.detailId!==record.detailId || parsed.content!==record.content ||
         norm(saved.content)!==norm(record.content) || norm(saved.name,50)!==norm(record.name,50)) {
        result.conflicts++;continue;
      }
      result.eligible.push({detailId:record.detailId,archiveEntryId:remote.id,nativeEntryId:native.id});
    }
    return result;
  }
  // Native writes can succeed even if the response/readback is interrupted.
  // Check pending/handoff records against the CURRENT attached private Lorebook
  // without updating local links or assuming a matching row was created by QoL.
  function inspectPendingNativeRecords(records, book, factMap) {
    const entries=Array.isArray(book?.entries)?book.entries:null;
    const count=book?.num_entries;
    const uniqueIds=entries?new Set(entries.filter(e=>UUID.test(e?.id))
      .map(e=>String(e.id).toLowerCase())):new Set();
    const complete=!!entries && Number.isSafeInteger(count) && count>=0 &&
      entries.length===count && uniqueIds.size===count;
    const result={pending:0,exactCandidates:0,unverifiedPage:0,unreadableKeywords:0,
      conflicts:0,ambiguous:0,notFound:0,sourceChanged:0,otherBook:0,complete};
    const normalizeKeywords=value=>{
      if(!Array.isArray(value) || value.some(v=>typeof v!=='string'))return null;
      const normalized=value.map(v=>norm(v,80).toLowerCase()).filter(Boolean);
      return [...new Set(normalized)].sort();
    };
    const sameKeywords=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const matchingByEntry=new Map();
    const pending=[];
    for(const record of records){
      if(!['pending','handoff'].includes(record?.native?.status) || record.native.id)continue;
      result.pending++;
      if(String(record.native.bookId||'').toLowerCase()!==String(book?.id||'').toLowerCase()){
        result.otherBook++;continue;
      }
      const fact=factMap?.get(record.detailId);
      if(!record.sourceText || !fact || fact.enabled===false || fact.needsReview ||
         fact.supersededBy || String(fact.text||'').trim()!==record.sourceText ||
         record.status==='restored-needs-review'){
        result.sourceChanged++;continue;
      }
      if(!complete){result.unverifiedPage++;continue;}
      const name=norm(record.name,50),content=String(record.content||'').trim();
      const names=entries.filter(e=>typeof e?.name==='string' && norm(e.name,50)===name);
      if(!names.length){result.notFound++;continue;}
      const sameText=names.filter(e=>typeof e.content==='string' && e.content.trim()===content);
      if(!sameText.length){result.conflicts++;continue;}
      const localKeywords=normalizeKeywords(record.keywords);
      const comparable=sameText.map(e=>({entry:e,keywords:normalizeKeywords(e.keywords)}));
      if(!localKeywords || comparable.some(x=>!x.keywords)){
        result.unreadableKeywords++;continue;
      }
      const matches=comparable.filter(x=>sameKeywords(localKeywords,x.keywords));
      if(!matches.length){result.conflicts++;continue;}
      if(matches.length!==1){result.ambiguous++;continue;}
      const id=String(matches[0].entry.id).toLowerCase();
      if(!UUID.test(id)){result.unverifiedPage++;continue;}
      pending.push(id);
      matchingByEntry.set(id,(matchingByEntry.get(id)||0)+1);
    }
    for(const id of pending){
      if(matchingByEntry.get(id)>1)result.ambiguous++;
      else result.exactCandidates++;
    }
    // Even an exact match is only a candidate: ownership of the Lorebook is
    // verified elsewhere, but this cannot prove which POST created the row.
    return result;
  }
  async function createEntry(bookId, entry, s, confirmed, accountId) {
    if (!confirmed || !sameRoute(s)) throw new Error('No longer authorized for this conversation.');
    await requireCurrentReviewedFact(s,{id:entry.detailId,text:entry.record?.sourceText});
    // Refresh the authority before EVERY native write, not just when opening the modal.
    const check = await verifyBot(s);
    if (check.accountId !== accountId || check.bookId !== bookId) throw new Error('Bot/Lorebook association changed.');
    const before = await local.list(accountId,s.botId,s.conversationId);
    const already = before.find(x=>x.native?.id && x.native.bookId === bookId && x.detailId === entry.detailId);
    if (already || before.some(x=>x.detailId === entry.detailId && ['pending','handoff'].includes(x.native?.status))) throw new Error('This fact already has a native entry, pending review, or unresolved write. Do not create a duplicate.');
    if ((check.book?.entries||[]).some(row=>norm(row?.name,50).toLowerCase()===entry.payload.name.toLowerCase())) throw new Error('An entry with this name already exists in the attached Lorebook. Review it instead of duplicating.');
    const grant=await DS.privateLorebookAuth.prepareEntryCreate(s);
    await requireCurrentReviewedFact(s,{id:entry.detailId,text:entry.record?.sourceText});
    await local.put({...entry.record,native:{status:'pending',bookId,requestedAt:Date.now()}},'Native entry creation pending');
    let created;
    try {
      await requireCurrentReviewedFact(s,{id:entry.detailId,text:entry.record?.sourceText});
      created=await DS.privateLorebookAuth.createEntry({scope:s,accountId,bookId,detailId:entry.detailId,
        mode:'native-auto',entry:entry.payload,grant});
    }
    catch(error) {
      if(error?.ambiguous!==true)await local.put(entry.record,'Native creation rejected before write');
      throw error;
    }
    if (!UUID.test(created?.id) || String(created.lorebookId).toLowerCase() !== bookId) {
      throw new Error('SpicyChat did not return a verifiable created entry ID. Do not retry until checked manually.');
    }
    // A second read must confirm the SAME owned attached Lorebook. If it
    // changed after POST, leave the pending marker for manual reconciliation.
    const after=await verifyBot(s);
    if(after.accountId!==accountId || after.bookId!==bookId)
      throw new Error('The attached Lorebook changed after saving. Check the entry manually; do not retry.');
    const record = await local.put({...entry.record,native:{id:created.id,bookId,version:created.version || 1,verifiedCreated:true}},'Native entry created (save response verified)');
    return record;
  }
  function editorInput(label, value, max, multiline=false) {
    const container = node('label');container.className = 'ds-private-lb-field';
    container.append(node('span', label));
    const input = node(multiline?'textarea':'input');input.value=value||'';input.maxLength=max;
    if (multiline) input.rows=5;
    container.append(input);return [container,input];
  }
  function makePayload(detail) {
    const text = norm(detail.text);
    const category = norm(detail.category || 'Fact',30);
    const phrase = text.split(/[.!?\n]/)[0].slice(0,48).trim();
    return {name:norm(`${category.charAt(0).toUpperCase()+category.slice(1)}: ${phrase}`,50),keywords:[],content:text};
  }
  // A modal may remain open while Context Keeper replaces a fact, or while
  // another tab changes it. Re-read the authoritative conversation record
  // before every handoff/write. Never promote a stale UI snapshot to canon.
  async function requireCurrentReviewedFact(s, snapshot) {
    if (!sameRoute(s)) throw new Error('Conversation changed. Reopen Context Keeper.');
    const data=await new Promise((resolve,reject)=>chrome.storage.local.get(['contextKeeperData'],
      value=>chrome.runtime.lastError?reject(new Error(chrome.runtime.lastError.message)):resolve(value)));
    const details=data?.contextKeeperData?.[`conversation:${s.conversationId}`]?.details;
    const live=Array.isArray(details)?details.find(item=>item?.id===snapshot?.id):null;
    if (!live || live.enabled===false || live.needsReview || live.supersededBy ||
        !String(live.text||'').trim() || String(live.text||'').trim()!==String(snapshot?.text||'').trim()) {
      throw new Error('This Context Keeper fact has changed, was disabled, or needs review. Reopen the manager before saving.');
    }
    if (!sameRoute(s)) throw new Error('Conversation changed. Reopen Context Keeper.');
    return live;
  }
  function detailList(raw, s) {
    const key = `conversation:${s.conversationId}`;
    return (Array.isArray(raw?.[key]?.details) ? raw[key].details : [])
      .filter(item => item?.enabled !== false && !item?.supersededBy && item?.text)
      .sort((a,b)=>Number(b.pinned)-Number(a.pinned)||Number(b.createdAt)-Number(a.createdAt));
  }
  async function legacyFacts(s) {
    const data = await new Promise((resolve,reject)=>chrome.storage.local.get(['contextKeeperData'],v=>chrome.runtime.lastError?reject(new Error(chrome.runtime.lastError.message)):resolve(v)));
    return (data?.contextKeeperData?.[s.botId]?.details || []).filter(item=>item && item.text);
  }
  async function importLegacyFacts(s) {
    const legacy=await legacyFacts(s);
    if(!legacy.length) throw new Error('No legacy bot-scoped facts found.');
    if(!confirm(`Copy ${legacy.length} old bot-scoped facts into THIS conversation only? All imports require review before promotion. The originals will remain untouched.`)) return 0;
    if(!sameRoute(s))throw new Error('Conversation changed.');
    const result=await new Promise((resolve,reject)=>chrome.storage.local.get(['contextKeeperData'],v=>chrome.runtime.lastError?reject(new Error(chrome.runtime.lastError.message)):resolve(v)));
    const data=result.contextKeeperData||{};
    const key=`conversation:${s.conversationId}`;
    const existing=data[key]&&typeof data[key]==='object'?data[key]:{};
    const details=Array.isArray(existing.details)?existing.details:[];
    const ids=new Set(details.map(item=>item.id));
    const imported=legacy.filter(item=>!ids.has(`legacy-${s.botId}-${item.id}`)).map(item=>({
      ...item,id:`legacy-${s.botId}-${item.id}`,source:'legacy-bot-scope',needsReview:true,
      enabled:false,createdAt:Date.now(),updatedAt:Date.now()
    }));
    if(!imported.length)return 0;
    if(!sameRoute(s))throw new Error('Conversation changed.');
    if(typeof DS.saveContextKeeperConversationPatch !== 'function')
      throw new Error("Context Keeper protected save helper is unavailable.");
    await DS.saveContextKeeperConversationPatch(key, result.contextKeeperData?.[key] ?? null,
      {...existing,details:[...details,...imported]});
    return imported.length;
  }
  async function collect(s) {
    const data = await new Promise((resolve,reject)=>chrome.storage.local.get(['contextKeeperData'], value=>chrome.runtime.lastError?reject(new Error(chrome.runtime.lastError.message)):resolve(value)));
    return detailList(data?.contextKeeperData,s);
  }
  async function archiveRecord(owner,s,detail,payload,existing) {
    const live=await requireCurrentReviewedFact(s,detail);
    const sourceText=String(live.text||'').trim();
    const different = !!existing && (existing.content !== payload.content || existing.name !== payload.name ||
      JSON.stringify(existing.keywords||[]) !== JSON.stringify(payload.keywords) ||
      (existing.sourceText && existing.sourceText !== sourceText));
    if (different && existing?.remote?.status === 'pending')
      throw new Error('This fact has an uncertain Archive write. Reconcile the pending entry before revising it.');
    const record = {...existing,accountId:owner,botId:s.botId,conversationId:s.conversationId,detailId:detail.id,
      content: payload.content, name:payload.name, keywords:payload.keywords, sourceText,
      sourceMessageId:norm(detail.messageId,120),
      source:'context-keeper', createdAt:existing?.createdAt || Date.now(), status:existing?.status || 'stored'};
    if (different && record.remote?.id) record.remote = {...record.remote,stale:true};
    if (different && record.native?.id) record.native = {...record.native,stale:true};
    return local.put(record,'Archived Context Keeper detail');
  }
  // Archives use unguessable synthetic keywords, NOT story keywords: they are never meant to trigger native context.
  async function syncArchive(accountId, s, record, target, interactive = true) {
    if (!sameRoute(s)) throw new Error('Conversation changed.');
    await requireCurrentReviewedFact(s,{id:record.detailId,text:record.sourceText});
    if (record.remote?.stale) throw new Error('Archive entry differs from the local fact. Existing-entry updating is not verified; review it manually.');
    if (record.remote?.id && record.remote.bookId === target.id) return record;
    if (['pending','handoff'].includes(record.remote?.status)) throw new Error('Archive write requires manual reconciliation; automatic retry blocked.');
    if (DS.privateLorebookAuth?.entryCreateSupported !== true)
      throw new Error('Background entry creation is unavailable. Use the reviewed native Archive editor handoff.');
    if (interactive && !confirm('Save this record to your private Archive Lorebook? QoL will not connect it to any bot.')) return record;
    const rechecked = await verifyBot(s);
    if (rechecked.accountId !== accountId) throw new Error('Account changed.');
    const freshArchive=await verifyArchive(accountId,target.id,rechecked.bookId);
    // A paginated Archive response cannot exclude another tab's previous save.
    // Require a complete, uniquely identified entry list before any new POST.
    const remoteRows=freshArchive.entries;
    if(!Array.isArray(remoteRows) || !Number.isSafeInteger(freshArchive.num_entries) ||
       remoteRows.length!==freshArchive.num_entries ||
       new Set(remoteRows.map(row=>String(row?.id||'').toLowerCase())).size!==freshArchive.num_entries)
      throw new Error('Archive entry list is incomplete. No new entry was posted; retry the read-only audit later.');
    if(remoteRows.some(row=>recovery.parse(row,s)?.detailId===record.detailId))
      throw new Error('This fact already appears in the private Archive. Recover/reconcile the existing entry instead of creating a duplicate.');
    const content = recovery.packageEntry(record,s);
    const slug=record.detailId.replace(/[^a-z0-9]/gi,'').slice(-12);
    const payload={name:`QoL Archive ${s.botId.slice(0,7)} ${slug}`.slice(0,50),keywords:[`qol-archive-${slug}`],content};
    // Acquire a usable session BEFORE leaving a pending write-ahead marker.
    const grant=await DS.privateLorebookAuth.prepareEntryCreate(s);
    await requireCurrentReviewedFact(s,{id:record.detailId,text:record.sourceText});
    await local.put({...record,remote:{status:'pending',bookId:target.id,requestedAt:Date.now()}},'Archive write pending');
    let response;
    try {
      await requireCurrentReviewedFact(s,{id:record.detailId,text:record.sourceText});
      response=await DS.privateLorebookAuth.createEntry({scope:s,accountId,bookId:target.id,
        detailId:record.detailId,mode:interactive?'archive-manual':'archive-auto',entry:payload,grant});
    }
    catch(error) {
      // Background preflight definitively blocked the request. Only then may
      // the pending marker be cleared; unknown POST results remain pending.
      if(error?.ambiguous!==true)await local.put(record,'Archive entry rejected before a confirmed write');
      throw error;
    }
    if (!UUID.test(response?.id) || String(response.lorebookId).toLowerCase() !== target.id) throw new Error('Archive write unconfirmed. Do not retry until checked.');
    return local.put({...record,remote:{id:response.id,bookId:target.id,version:response.version||1,status:'confirmed'}},'Archive Lorebook entry created');
  }
  async function show() {
    document.getElementById(MODAL)?.remove();
    const s = scope();if(!s)return;
    const overlay = node('div',null,'ds-private-lb-overlay');overlay.id=MODAL;
    const dialog = node('div',null,'ds-private-lb-dialog');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-label','Private Lorebook Bridge');
    dialog.append(node('h2','Context Keeper → Private Lorebook'),node('p','Only your private bot and its verified, private, attached Lorebook may be edited. Your shared Archive Lorebook is storage only.'),
      node('p','Experimental — still needs testing. Review every saved fact, keep backups, and verify native Archive writes/readback before relying on this for long-term continuity. Existing-entry native updates/deletes and remote Archive cleanup are not automated.'));
    const status=node('p','Checking ownership…','ds-private-lb-status');status.setAttribute('role','status');
    const close=node('button','Close');close.type='button';close.addEventListener('click',()=>overlay.remove());dialog.append(close,status);
    overlay.append(dialog);document.body.append(overlay);
    const started=location.href;
    try {
      const context=await verifyBot(s);
      if (!sameRoute(s)) throw new Error('Conversation changed.');
      status.textContent=`Verified: private owned bot, attached private Lorebook ${context.bookId.slice(0,8)}…`;
      async function checkConfiguredArchive() {
        const archiveId=norm(settings().privateLorebookArchiveId,36).toLowerCase();
        if (!UUID.test(archiveId)) throw new Error('Configure a shared private Archive Lorebook in Settings first.');
        const current=await verifyBot(s);
        if(current.accountId!==context.accountId || current.bookId!==context.bookId) throw new Error('Account or attached Lorebook changed.');
        const archive=await verifyArchive(context.accountId,archiveId,context.bookId);
        const records=await local.list(context.accountId,s.botId,s.conversationId);
        const uploaded=records.filter(x=>x.remote?.status==='confirmed' && x.remote?.bookId===archiveId && x.remote?.id).length;
        const pending=records.filter(x=>x.remote?.status==='pending').length;
        const stale=records.filter(x=>x.remote?.stale).length;
        const entryCount=Number.isInteger(archive.num_entries) ? archive.num_entries : (Array.isArray(archive.entries)?archive.entries.length:null);
        status.textContent=`Archive verified: private, owned, connected to 0 bots. This conversation: ${records.length} local records, ${uploaded} linked to Archive, ${pending} pending reconciliation, ${stale} changed since upload. ${entryCount===null?'Entry total unavailable.':`Archive reports ${entryCount} entries.`} Stored links are not a complete remote-content audit.`;
      }
      async function auditConfiguredArchive() {
        const archiveId=norm(settings().privateLorebookArchiveId,36).toLowerCase();
        if (!UUID.test(archiveId)) throw new Error('Configure a shared private Archive Lorebook in Settings first.');
        const current=await verifyBot(s);
        if (current.accountId !== context.accountId || current.bookId !== context.bookId)
          throw new Error('Account or attached Lorebook changed.');
        const archive=await verifyArchive(context.accountId,archiveId,context.bookId);
        // Scope the local data to exactly this signed-in account, bot and conversation.
        const records=await local.list(context.accountId,s.botId,s.conversationId);
        if (!sameRoute(s)) throw new Error('Conversation changed during Archive audit.');
        status.textContent=archiveAuditSummary(inspectArchiveRecords(records,archive,s));
      }
      async function auditPendingNativeEntries() {
        if(!sameRoute(s))throw new Error('Conversation changed.');
        // verifyBot fetches the current owner, attached book, and visibility.
        const current=await verifyBot(s);
        if(current.accountId!==context.accountId || current.bookId!==context.bookId)
          throw new Error('Ownership or attached Lorebook changed.');
        const records=await local.list(context.accountId,s.botId,s.conversationId);
        const keeper=await new Promise((resolve,reject)=>chrome.storage.local.get(['contextKeeperData'],
          v=>chrome.runtime.lastError?reject(new Error(chrome.runtime.lastError.message)):resolve(v)));
        const facts=keeper?.contextKeeperData?.[`conversation:${s.conversationId}`]?.details;
        const factMap=new Map((Array.isArray(facts)?facts:[]).filter(f=>f?.id).map(f=>[f.id,f]));
        if(!sameRoute(s))throw new Error('Conversation changed.');
        const result=inspectPendingNativeRecords(records,current.book,factMap);
        status.textContent=`Read-only native entry check: ${result.pending} pending/handoff records; `+
          `${result.exactCandidates} exact possible matches, ${result.ambiguous} ambiguous, `+
          `${result.conflicts} conflicts, ${result.notFound} not found, `+
          `${result.unreadableKeywords} without comparable keyword data, `+
          `${result.sourceChanged} changed or unapproved sources, `+
          `${result.otherBook} pointing at a different attached Lorebook, `+
          `${result.unverifiedPage} not verifiable from a partial entry list. `+
          (result.complete?'Complete entry list received. ':'The native entries returned were incomplete. ')+
          'No pending marker was cleared, and no native entry was created, edited, or deleted. ' +
          'Even an exact match must be checked manually before assuming a save succeeded.';
      }
      function addNativeAuditButton(parent) {
        const button=node('button','Check pending native entries (read only)');button.type='button';
        button.addEventListener('click',async()=>{
          button.disabled=true;status.textContent='Checking the attached private Lorebook for pending entries…';
          try{await auditPendingNativeEntries();}catch(error){status.textContent=String(error?.message||error);}
          finally{button.disabled=false;}
        });parent.append(button);
      }
      // Reconciliation is local only: read remote entries, match exact source
      // identifiers and content, and restore link metadata after explicit review.
      // Never retry a POST, edit a native entry, or infer a deletion from a
      // partial paginated response.
      async function previewArchiveCleanup() {
        if(!sameRoute(s)) throw new Error('Conversation changed.');
        const current=await verifyBot(s);
        if(current.accountId!==context.accountId || current.bookId!==context.bookId)
          throw new Error('Private bot or Lorebook ownership changed.');
        const archiveId=norm(settings().privateLorebookArchiveId,36).toLowerCase();
        if(!UUID.test(archiveId))throw new Error('Configure a shared private Archive first.');
        const archive=await verifyArchive(context.accountId,archiveId,context.bookId);
        const records=await local.list(context.accountId,s.botId,s.conversationId);
        const keeper=await new Promise((resolve,reject)=>chrome.storage.local.get(['contextKeeperData'],
          v=>chrome.runtime.lastError?reject(new Error(chrome.runtime.lastError.message)):resolve(v)));
        const facts=keeper?.contextKeeperData?.[`conversation:${s.conversationId}`]?.details;
        const factMap=new Map((Array.isArray(facts)?facts:[]).filter(item=>item?.id).map(item=>[item.id,item]));
        if(!sameRoute(s))throw new Error('Conversation changed.');
        const result=inspectArchiveCleanup(records,archive,current.book,s,factMap);
        status.textContent=`Read-only Archive cleanup preview: ${result.eligible.length} potentially redundant `+
          `remote entry(s), ${result.notPromoted} not confirmed as promoted, `+
          `${result.notVerifiable} not verifiable from loaded native pages, and `+
          `${result.conflicts} content conflicts. Nothing was deleted or changed. `+
          `Remote cleanup remains unavailable until safe deletion and restoration are verified.`;
      }
      function addCleanupPreview(parent) {
        const btn=node('button','Preview Archive cleanup (read only)');btn.type='button';
        btn.addEventListener('click',async()=>{btn.disabled=true;
          try {await previewArchiveCleanup();}catch(error){status.textContent=String(error?.message||error);}
          finally{btn.disabled=false;}
        });parent.append(btn);
      }
      async function recoverArchiveRecords() {
        const archiveId=norm(settings().privateLorebookArchiveId,36).toLowerCase();
        if(!UUID.test(archiveId)) throw new Error('Configure a private Archive Lorebook first.');
        const current=await verifyBot(s);
        if(current.accountId!==context.accountId || current.bookId!==context.bookId)
          throw new Error('Account or attached Lorebook changed.');
        const archive=await verifyArchive(context.accountId,archiveId,context.bookId);
        const before=await local.list(context.accountId,s.botId,s.conversationId);
        if(!sameRoute(s)) throw new Error('Conversation changed during recovery.');
        const planned=recovery.plan(archive,before,s);
        const {stats,actions}=planned;
        if(!stats.complete){
          status.textContent=`Archive recovery paused: SpicyChat did not return a complete, uniquely identified entry list. `+
            `${stats.scanned} entries returned; ${stats.matched} matching facts seen. `+
            'No local links were changed and no remote entries were retried or deleted.';
          return;
        }
        if(!actions.length){
          status.textContent=`Archive scan: ${stats.matched} matching records, ${stats.alreadyLinked} already linked, ${stats.conflicts} content conflicts, ${stats.duplicates} duplicate remote IDs. `+
            (stats.complete?'Full Archive entry list returned.':'Only the currently returned Archive entries were checked.');
          return;
        }
        const limit=75;
        if(!confirm(`Recover ${Math.min(actions.length,limit)} locally (${stats.recover} missing local records; ${stats.reconnect} existing records needing a saved link)? `+
          `This reads your private Archive and writes only to this browser's IndexedDB. It will not change SpicyChat's Lorebook. `+
          `${stats.conflicts} conflict(s) and ${stats.duplicates} duplicated record(s) will be skipped.`))return;
        // Refresh account/attachment and remote data after user confirmation.
        const checked=await verifyBot(s);
        if(checked.accountId!==context.accountId || checked.bookId!==context.bookId)
          throw new Error('Ownership or attached Lorebook changed during recovery.');
        const recent=await verifyArchive(context.accountId,archiveId,context.bookId);
        const newest=recovery.plan(recent,await local.list(context.accountId,s.botId,s.conversationId),s);
        if(!newest.stats.complete)
          throw new Error('Archive entry list became incomplete after confirmation. Nothing reconciled.');
        const approved=new Map(actions.map(x=>[x.kind+'|'+x.entry.id+'|'+x.entry.detailId,x.entry]));
        let saved=0,skipped=0;
        for(const action of newest.actions.slice(0,limit)) {
          const original=approved.get(action.kind+'|'+action.entry.id+'|'+action.entry.detailId);
          if(!original || original.content!==action.entry.content || original.schema!==action.entry.schema){skipped++;continue;}
          if(!sameRoute(s))throw new Error('Conversation changed. Recovery stopped.');
          const {entry}=action;
          const identity={accountId:context.accountId,botId:s.botId,conversationId:s.conversationId,detailId:entry.detailId};
          const key=local.keyOf(identity);
          const existing=await local.get(key);
          if(action.kind==='recover' && existing){skipped++;continue;}
          if(action.kind==='reconnect' && (!existing || existing.content!==entry.content ||
              (existing.remote?.id && String(existing.remote.id).toLowerCase()!==entry.id) ||
              (existing.remote?.bookId && String(existing.remote.bookId).toLowerCase()!==archiveId))){skipped++;continue;}
          const record=action.kind==='recover'?{
            ...identity,name:entry.name,keywords:entry.keywords,content:entry.content,
            source:'archive-recovery',sourceMessageId:entry.sourceMessageId,status:'stored',createdAt:Date.now()
          }:{...existing};
          record.remote={id:entry.id,bookId:archiveId,version:entry.version,status:'confirmed',stale:false,
            reconciledAt:Date.now()};
          await local.put(record,action.kind==='recover'?'Recovered exact conversation-scoped Archive entry':'Reconciled verified pending Archive link');
          saved++;
        }
        status.textContent=`Recovered/relinked ${saved} local record(s), skipped ${skipped}; `+
          `${stats.conflicts} conflicts and ${stats.duplicates} duplicate matches left untouched. `+
          (stats.complete?'Full remote entry list checked.':'Remote listing may be partial; missing entries were NOT treated as deleted.');
      }
      // Explicit import of already recovered archive copies into Context Keeper.
      // All imported facts are DISABLED and require manual review before recall.
      async function sendRecoveredFactsToKeeper() {
        if (settings().enableContextKeeper!==true || typeof DS.addContextKeeperDetails!=='function')
          throw new Error('Enable standalone Context Keeper first. No local facts were changed.');
        const checked=await verifyBot(s);
        if(checked.accountId!==context.accountId || checked.bookId!==context.bookId)
          throw new Error('Account or attached Lorebook changed.');
        const archiveId=norm(settings().privateLorebookArchiveId,36).toLowerCase();
        if(!UUID.test(archiveId)) throw new Error('Configure a private Archive Lorebook first.');
        const archive=await verifyArchive(context.accountId,archiveId,context.bookId);
        const remoteEntries=new Map();
        for(const row of Array.isArray(archive.entries)?archive.entries:[]) {
          const parsed=recovery.parse(row,s);
          if(parsed && !remoteEntries.has(parsed.id)) remoteEntries.set(parsed.id,parsed);
        }
        const saved=await local.list(context.accountId,s.botId,s.conversationId);
        const candidates=saved.filter(r=>r.source==='archive-recovery' && r.remote?.status==='confirmed' &&
          r.remote.bookId===archiveId && !r.remote.stale && remoteEntries.get(String(r.remote.id).toLowerCase())?.content===r.content)
          .slice(0,50);
        if(!candidates.length) throw new Error('No verified recovered Archive facts are visible in the current remote entry page. Use Recover / reconcile first.');
        if(!confirm(`Copy up to ${candidates.length} verified recovered facts into this conversation's Context Keeper? All will be disabled and marked for review until you approve them.`))return;
        if(!sameRoute(s))throw new Error('Conversation changed during import.');
        const values=candidates.map(r=>({text:r.content,source:'archive-recovery',enabled:false,needsReview:true,
          messageId:r.sourceMessageId||'',category:'other'}));
        const result=await DS.addContextKeeperDetails(values,{source:'archive-recovery',expectedChatId:`conversation:${s.conversationId}`});
        if(!sameRoute(s))throw new Error('Conversation changed while importing; check Context Keeper before continuing.');
        status.textContent=`Context Keeper import: ${Number(result?.added||0)} new review-only details, ${Number(result?.skipped||0)} existing/duplicate details skipped. Nothing was enabled automatically.`;
      }
      function addKeeperRecoveryButton(host) {
        const b=node('button','Copy recovered facts to Context Keeper for review');b.type='button';
        b.addEventListener('click',async()=>{b.disabled=true;
          try{await sendRecoveredFactsToKeeper();}catch(error){status.textContent=String(error?.message||error);}
          finally{b.disabled=false;}
        });host.append(b);
      }
      function addRecoveryButton(host) {
        const b=node('button','Recover / reconcile Archive entries (local only)');b.type='button';
        b.title='Find exact conversation-scoped Archive records and safely restore missing local copies or pending links. Never posts or deletes.';
        b.addEventListener('click',async()=>{b.disabled=true;status.textContent='Checking saved Archive entries and pending writes…';
          try{await recoverArchiveRecords();}catch(error){status.textContent=String(error?.message||error);}
          finally{b.disabled=false;}
        });host.append(b);
      }
      function addAuditButton(host) {
        const button=node('button','Verify saved Archive entries (read only)');button.type='button';
        button.title="Compare this conversation's locally recorded Archive links with SpicyChat. No writes or retries.";
        button.addEventListener('click',async()=>{
          button.disabled=true;status.textContent='Reading the private Archive and comparing entries…';
          try {await auditConfiguredArchive();}
          catch(error) {status.textContent=String(error?.message||error);}
          finally {button.disabled=false;}
        });host.append(button);
      }
      // Portable backup of the private LOCAL Archive (extension IndexedDB).
      // This contains private continuity text, so export only on direct click.
      // No native Lorebook is changed by either action.
      const BACKUP_FORMAT='dsq-private-archive-local-backup/v1';
      const restoreInput=document.createElement('input');
      restoreInput.type='file';restoreInput.accept='.json,application/json';restoreInput.hidden=true;
      dialog.append(restoreInput);
      const backupButton=node('button','Download local Archive backup');
      backupButton.type='button';backupButton.addEventListener('click',async()=>{
        backupButton.disabled=true;
        try {
          const fresh=await verifyBot(s);
          if(!sameRoute(s)||fresh.accountId!==context.accountId||fresh.bookId!==context.bookId)
            throw new Error('Account, bot or attached Lorebook changed.');
          const rows=await local.list(context.accountId,s.botId,s.conversationId);
          if(rows.length>2000)throw new Error('Too many records for one backup. Contact support before proceeding.');
          const payload={format:BACKUP_FORMAT,exportedAt:new Date().toISOString(),
            scope:{accountId:context.accountId,botId:s.botId,conversationId:s.conversationId},
            // Revision history is still held in original IndexedDB; this
            // portable backup includes current records, not past revisions.
            records:rows.map(({key,conversationKey,...rest})=>rest)};
          if(!sameRoute(s))throw new Error('Conversation changed.');
          const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
          const url=URL.createObjectURL(blob),link=document.createElement('a');
          link.href=url;link.download=`spicychat-qol-local-archive-${s.conversationId.slice(0,8)}-${new Date().toISOString().slice(0,10)}.json`;
          document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
          status.textContent=`Prepared backup of ${rows.length} local record(s). Keep it private. This backup does not include earlier revision history or prove a file reached disk.`;
        }catch(error){status.textContent=String(error?.message||error);}
        finally{backupButton.disabled=false;}
      });
      const restoreButton=node('button','Restore missing local Archive records');
      restoreButton.type='button';restoreButton.addEventListener('click',()=>{restoreInput.value='';restoreInput.click();});
      restoreInput.addEventListener('change',async()=>{
        const file=restoreInput.files?.[0];if(!file)return;
        restoreButton.disabled=true;
        try{
          if(file.size>8*1024*1024)throw new Error('Backup is over 8 MB. Restore smaller conversation backups.');
          const data=JSON.parse(await file.text());
          const rows=data?.records,old=data?.scope;
          if(data?.format!==BACKUP_FORMAT||!Array.isArray(rows)||rows.length>2000||
             old?.accountId!==context.accountId||old?.botId!==s.botId||old?.conversationId!==s.conversationId)
            throw new Error('Backup does not match this signed-in private conversation. Nothing restored.');
          const verified=await verifyBot(s);
          if(!sameRoute(s)||verified.accountId!==context.accountId||verified.bookId!==context.bookId)
            throw new Error('Account or private bot changed. Nothing restored.');
          if(!confirm(`Restore missing LOCAL Archive records from this backup (${rows.length} entries)? Existing records will never be overwritten. Restored links need review before remote use. No native Lorebook will be changed.`))return;
          let added=0,skipped=0;
          for(let offset=0;offset<rows.length;offset+=50){
            if(!sameRoute(s))throw new Error('Conversation changed. Restore stopped.');
            const subset=rows.slice(offset,offset+50);
            const outcome=await local.importMissing({accountId:context.accountId,
              botId:s.botId,conversationId:s.conversationId},subset);
            added+=Number(outcome?.inserted||0);skipped+=Number(outcome?.skipped||0);
          }
          status.textContent=`Local restore: ${added} missing record(s) added, ${skipped} existing left untouched. Restored native/Archive links require fresh verification before use.`;
        }catch(error){status.textContent=`Restore stopped: ${String(error?.message||error)}. Earlier batches, if any, remain saved.`;}
        finally{restoreInput.value='';restoreButton.disabled=false;}
      });
      const backupNote=node('p','Local Archive backup: exports current records for this conversation only (not revision history). Files contain private text. Restoring never overwrites existing records and never writes to SpicyChat.');
      dialog.append(backupButton,restoreButton,backupNote);
      const details=await collect(s);
      const legacy=await legacyFacts(s);
      if (legacy.length) {
        const importBtn=node('button',`Import old bot-scoped details (${legacy.length}) for this conversation`);
        importBtn.type='button';importBtn.addEventListener('click',async()=>{
          importBtn.disabled=true;
          try {const count=await importLegacyFacts(s);status.textContent=`Copied ${count} legacy details, disabled and flagged for Context Keeper review. Reopen this window after reviewing them.`;}
          catch(error) {status.textContent=String(error?.message||error);}finally{importBtn.disabled=false;}
        });dialog.append(importBtn);
      }
      if (!details.length) {
        const verifyButton=node('button','Check Archive status (read only)');verifyButton.type='button';
        verifyButton.addEventListener('click',async()=>{verifyButton.disabled=true;
          try{await checkConfiguredArchive();}catch(error){status.textContent=String(error?.message||error);}finally{verifyButton.disabled=false;}
        });
        dialog.append(verifyButton);
        addAuditButton(dialog);
        addNativeAuditButton(dialog);
        addCleanupPreview(dialog);
        addRecoveryButton(dialog);
        addKeeperRecoveryButton(dialog);
        dialog.append(node('p','No approved active Context Keeper facts for this conversation yet. You can still recover locally saved Archive facts above.'));
        return;
      }
      const selector=node('select');for(const detail of details.slice(0,300)) {
        const option=node('option',norm(detail.text,145));option.value=detail.id;selector.append(option);
      }
      const selectLabel=node('label','Source fact');selectLabel.append(selector);dialog.append(selectLabel);
      const [nameLabel,name]=editorInput('Entry name (max 50)','',50);
      const [keywordLabel,keywords]=editorInput('Distinctive keywords (comma separated, max 12)','',600);
      const [contentLabel,content]=editorInput('Entry content (max 2,000)','',2000,true);
      dialog.append(nameLabel,keywordLabel,contentLabel);
      const canonLabel=node('label');canonLabel.style.flexDirection='row';canonLabel.style.alignItems='center';
      const sharedCanon=node('input');sharedCanon.type='checkbox';sharedCanon.style.width='auto';
      canonLabel.append(sharedCanon,node('span','I confirm this information belongs in bot-wide canon and may affect ALL conversations using this private bot.'));
      dialog.append(canonLabel);
      function applySelected() {
        const detail=details.find(x=>x.id===selector.value);
        if(!detail)return;
        const suggested=makePayload(detail);
        name.value=suggested.name;content.value=suggested.content;
        keywords.value='';sharedCanon.checked=false;
        status.textContent=detail.needsReview?'This fact needs review before native promotion.':`Source: ${detail.source || 'Context Keeper'} · ${detail.messageId || 'manual'}`;
      }
      selector.addEventListener('change',applySelected);applySelected();
      async function selectedRecord(forNative=false) {
        if(forNative && !sharedCanon.checked) throw new Error('Confirm that this is shared bot canon before promoting it to the attached Lorebook.');
        const detail=details.find(x=>x.id===selector.value);
        if (!detail) throw new Error('Choose a valid source fact.');
        const current=await requireCurrentReviewedFact(s,detail);
        const payload=validateEntry({name:name.value,keywords:sortedUniqueKeywords(keywords.value),content:content.value});
        return {detail:current,payload};
      }
      const buttons=node('div',null,'ds-private-lb-buttons');dialog.append(buttons);
      function button(title,handler) {
        const el=node('button',title);el.type='button';buttons.append(el);
        el.addEventListener('click',async()=>{el.disabled=true;try{await handler();}catch(error){status.textContent=String(error?.message||error);}finally{el.disabled=false;}});return el;
      }
      button('Export this conversation archive',async()=>{
        const records=await local.list(context.accountId,s.botId,s.conversationId);
        if(!records.length)throw new Error('Nothing has been archived yet.');
        const blob=new Blob([JSON.stringify({schema:'dsq-private-lorebook-archive/v1',scope:s,records},null,2)],{type:'application/json'});
        const url=URL.createObjectURL(blob);const link=node('a');link.href=url;link.download=`qol-private-lorebook-${s.conversationId.slice(0,8)}.json`;
        document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1800);
        status.textContent='Exported a local copy of this conversation archive.';
      });
      button('Check Archive status (read only)',checkConfiguredArchive);
      button('Verify saved Archive entries (read only)',auditConfiguredArchive);
      addNativeAuditButton(buttons);
      addCleanupPreview(buttons);
      addRecoveryButton(buttons);
      addKeeperRecoveryButton(buttons);
      button('Save to local archive',async()=>{
        const {detail,payload}=await selectedRecord();if(!sameRoute(s))throw new Error('Conversation changed.');
        const key=local.keyOf({accountId:context.accountId,botId:s.botId,conversationId:s.conversationId,detailId:detail.id});
        await archiveRecord(context.accountId,s,detail,payload,await local.get(key));
        status.textContent='Saved to browser IndexedDB with a revision backup.';
      });
      if (['archive','hybrid'].includes(settings().privateLorebookStorageMode)) button('Review Archive entry in native editor',async()=>{
        const {detail,payload}=await selectedRecord();
        const archiveId=norm(settings().privateLorebookArchiveId,36).toLowerCase();
        const checked=await verifyBot(s);
        if(checked.accountId!==context.accountId || checked.bookId!==context.bookId)
          throw new Error('Ownership or attachment changed.');
        const target=await verifyArchive(context.accountId,archiveId,context.bookId);
        const key=local.keyOf({accountId:context.accountId,botId:s.botId,conversationId:s.conversationId,detailId:detail.id});
        const previous=await local.get(key);
        if(previous?.remote?.id || ['pending','handoff'].includes(previous?.remote?.status))
          throw new Error('This fact already has an Archive entry or an unresolved pending draft. Reconcile it first.');
        const record=await archiveRecord(context.accountId,s,detail,payload,previous);
        const archived=recovery.packageEntry(record,s);
        const slug=record.detailId.replace(/[^a-z0-9]/gi,'').slice(-12);
        const nativePayload={name:`QoL Archive ${s.botId.slice(0,7)} ${slug}`.slice(0,50),
          keywords:[`qol-archive-${slug}`],content:archived};
        const duplicate=(target.entries||[]).some(row=>recovery.parse(row,s)?.detailId===record.detailId);
        if(duplicate)throw new Error('SpicyChat already returned an Archive entry for this fact. Recover/reconcile it instead of creating a duplicate.');
        if(!sameRoute(s))throw new Error('Conversation changed.');
        const queue=DS.queuePrivateArchiveEditorEntry;
        if(typeof queue!=='function')throw new Error('Native Archive editor handoff unavailable.');
        await queue({accountId:context.accountId,botId:s.botId,conversationId:s.conversationId,
          bookId:archiveId,attachedBookId:context.bookId,detailId:record.detailId,payload:nativePayload});
        status.textContent='Archive entry queued. ';const link=node('a','Open the private Archive entry editor');
        link.href=`${location.origin}/lorebook/edit/${archiveId}/entries`;link.target='_blank';link.rel='noopener noreferrer';
        link.style.color='#9fd0ff';status.append(link);
        status.append(document.createTextNode('. Select Review Archive entry, inspect the filled fields, then press native Save. Reconcile the saved entry afterward.'));
      });
      if (['archive','hybrid'].includes(settings().privateLorebookStorageMode) && DS.privateLorebookAuth?.entryCreateSupported===true) button('Send to private Archive Lorebook',async()=>{
        const {detail,payload}=await selectedRecord();
        const archiveId=norm(settings().privateLorebookArchiveId,36).toLowerCase();
        if (!UUID.test(archiveId)) throw new Error('Set the one shared Archive Lorebook ID in Settings first.');
        const target=await verifyArchive(context.accountId,archiveId,context.bookId);
        const key=local.keyOf({accountId:context.accountId,botId:s.botId,conversationId:s.conversationId,detailId:detail.id});
        const record=await archiveRecord(context.accountId,s,detail,payload,await local.get(key));
        await syncArchive(context.accountId,s,record,target,true);
        status.textContent='Archive entry created and linked to the local source; never attached to a bot.';
      });
      button('Review in native attached Lorebook',async()=>{
        const {detail,payload}=await selectedRecord(true);
        const current=await verifyBot(s);
        if(current.accountId!==context.accountId||current.bookId!==context.bookId)throw new Error('Attachment changed.');
        const record=await archiveRecord(context.accountId,s,detail,payload,
          await local.get(local.keyOf({accountId:context.accountId,botId:s.botId,conversationId:s.conversationId,detailId:detail.id})));
        if(record.native?.id || ['pending','handoff'].includes(record.native?.status))throw new Error('This source has an existing or pending native entry. Resolve or edit that entry instead of creating a duplicate.');
        const queued={schema:1,accountId:context.accountId,botId:s.botId,conversationId:s.conversationId,
          bookId:context.bookId,detailId:detail.id,sourceText:String(detail.text||'').trim(),payload,queuedAt:Date.now()};
        await local.put({...record,native:{status:'handoff',bookId:context.bookId,queuedAt:Date.now()}},'Native editor handoff queued');
        await new Promise((resolve,reject)=>chrome.storage.local.set({[PENDING]:queued},()=>chrome.runtime.lastError?reject(new Error(chrome.runtime.lastError.message)):resolve()));
        status.textContent='Queued for native editor review. ';
        const link=node('a','Open the verified private Lorebook editor');
        link.href=`${location.origin}/lorebook/edit/${context.bookId}/entries`;link.target='_blank';link.rel='noopener noreferrer';
        link.style.color='#9fd0ff';status.append(link);
        status.append(document.createTextNode('. In that tab click Review queued entry, then Save.'));
      });
      if (settings().privateLorebookRequireReview === false && settings().privateLorebookAllowAutoCreate === true && settings().privateLorebookPromotionPolicy !== 'manual' && DS.privateLorebookAuth?.entryCreateSupported === true) {
        button('Create native entry without review',async()=>{
          if(!confirm('Unreviewed native Lorebook creation can add incorrect canon to EVERY chat using this bot. Continue at your own risk?'))return;
          const {detail,payload}=await selectedRecord(true);
          const record=await archiveRecord(context.accountId,s,detail,payload,
            await local.get(local.keyOf({accountId:context.accountId,botId:s.botId,conversationId:s.conversationId,detailId:detail.id})));
          await createEntry(context.bookId,{record,detailId:detail.id,payload},s,true,context.accountId);
          status.textContent='Native entry creation acknowledged and stored in local revision history.';
        });
      }
      const summary=node('p','Existing native entry changes are intentionally manual until update/delete requests and readback are proven.');
      dialog.append(summary);
    } catch(error) {status.textContent=String(error?.message||error);} // fail closed
  }
  function inputNative(field, value) {
    const proto=field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value')?.set?.call(field,value);
    field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
  }
  let lastQueueCheck=0;
  async function handoff() {
    const match=location.pathname.match(/^\/lorebook\/edit\/([0-9a-f-]{36})\/entries\/?$/i);
    if(!match || Date.now()-lastQueueCheck<2000 || document.getElementById('ds-private-lb-queue'))return;
    lastQueueCheck=Date.now();
    const queued=await new Promise(resolve=>chrome.storage.local.get([PENDING],v=>resolve(v?.[PENDING])));
    if (!queued || queued.bookId!==match[1].toLowerCase() || Date.now()-queued.queuedAt>20*60*1000) return;
    const anchor=document.querySelector("[data-testid='EntriesCreateHeader-AddEntryButton']")?.parentElement;
    if(!anchor)return;
    const banner=node('div',`Private Lorebook Bridge · ${queued.payload.name}`,'ds-private-lb-queue');banner.id='ds-private-lb-queue';
    const review=node('button','Review queued entry');review.type='button';
    review.addEventListener('click',async()=>{
      review.disabled=true;
      try {
        // The bot's association is re-verified even for UI handoff.
        const user=await identity();if(user!==queued.accountId)throw new Error('Account changed.');
        const bot=await api(`/v2/characters/${queued.botId}?include=rulebook`);
        if(bot?.creator_user_id!==user||!['hidden','private'].includes(bot.visibility)||firstId(bot.lorebooks)!==queued.bookId)throw new Error('Bot ownership/association changed.');
        const lb=await api(`/lorebooks/${queued.bookId}?sortBy=priority&lastSortPriority=0`);
        if(lb?.creator_user_id!==user||lb.visibility!=='private')throw new Error('Lorebook ownership/visibility changed.');
        // The editor is a different route: validate the queued conversation
        // directly instead of relying on the current chat URL here.
        const keeperData=await new Promise((resolve,reject)=>chrome.storage.local.get(['contextKeeperData'],
          v=>chrome.runtime.lastError?reject(new Error(chrome.runtime.lastError.message)):resolve(v)));
        const source=keeperData?.contextKeeperData?.[`conversation:${queued.conversationId}`]?.details;
        const latest=Array.isArray(source)?source.find(item=>item?.id===queued.detailId):null;
        if(!queued.sourceText || !latest || latest.enabled===false || latest.needsReview ||
           latest.supersededBy || String(latest.text||'').trim()!==queued.sourceText) {
          throw new Error('The queued fact has changed or needs review. Discard this draft and reopen Context Keeper.');
        }
        const add=document.querySelector("[data-testid='EntriesCreateHeader-AddEntryButton']");if(!add)throw new Error('Add Entry missing.');add.click();
        let name,content;
        for(let i=0;i<28;i++) {
          name=[...document.querySelectorAll('input[name="name"]')].find(el=>el.getClientRects().length);
          content=[...document.querySelectorAll('textarea[name="content"]')].find(el=>el.getClientRects().length);
          if(name&&content)break;await new Promise(r=>setTimeout(r,120));
        }
        if(!name||!content)throw new Error('Native editor not visible.');
        inputNative(name,queued.payload.name);inputNative(content,queued.payload.content);
        const form=content.closest('form')||content.parentElement;
        const keywordField=[...(form?.querySelectorAll('input')||[])].find(el=>el!==name && /keyword|tag/i.test(el.placeholder||''));
        if(!keywordField)throw new Error('Native keyword input missing. Save was not pressed.');
        for(const keyword of queued.payload.keywords) {
          inputNative(keywordField,keyword);
          keywordField.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:'Enter',which:13,keyCode:13,bubbles:true,cancelable:true}));
        }
        chrome.storage.local.remove(PENDING,()=>{});
        banner.textContent='Native form filled. Review fields and press Save yourself.';
      } catch(error) {banner.append(node('span',String(error?.message||error)));review.disabled=false;}
    });
    const discard=node('button','Discard queue');discard.type='button';discard.addEventListener('click',()=>chrome.storage.local.remove(PENDING,()=>banner.remove()));
    banner.append(review,discard);anchor.append(banner);
  }
  // Optional change-triggered archive sync. Never uploads without an explicit opt-in.
  // Changes outside the active, persisted conversation are not processed by this tab.
  let syncTimer = 0;
  let syncBusy = false;
  let syncSubscribed = false;
  let lastAutoRun = 0;
  async function synchronizeRecent() {
    const config = settings();
    if (syncBusy || !config.enabled || !config.enablePrivateLorebookBridge ||
        config.privateLorebookSyncMode !== 'on-change' || config.privateLorebookAllowArchiveAutoSync !== true ||
        !['archive','hybrid'].includes(config.privateLorebookStorageMode)) return;
    const s = scope();if (!s) return;
    const targetId = norm(config.privateLorebookArchiveId,36).toLowerCase();
    if (!UUID.test(targetId)) return;
    syncBusy=true;lastAutoRun=Date.now();
    try {
      const checked=await verifyBot(s);
      const target=await verifyArchive(checked.accountId,targetId,checked.bookId);
      const facts=(await collect(s)).filter(item=>!item.needsReview).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,75);
      const records=await local.list(checked.accountId,s.botId,s.conversationId);
      const byId=new Map(records.map(item=>[item.detailId,item]));
      let done=0;
      let moreFresh=false;
      for(const fact of facts) {
        if(!sameRoute(s)) break;
        const previous=byId.get(fact.id);
        // Only newly established facts; no resync loops or mass imports on enable.
        if (previous?.remote?.id || ['pending','handoff'].includes(previous?.remote?.status)) continue;
        if (Date.now()-Number(fact.createdAt||0)>5*60*1000) continue;
        if (done>=2) {moreFresh=true;break;}
        const safe=makePayload(fact);
        // For an archive we only require content, not keyword canon triggers.
        const record=await archiveRecord(checked.accountId,s,fact,safe,previous);
        try {await syncArchive(checked.accountId,s,record,target,false);done++;}
        catch {moreFresh=false;break;} // No retry after a rejected/uncertain write.
      }
      // A single Context Keeper save may approve multiple facts. Finish later
      // batches without needing another unrelated chat event. Bounded to two
      // POSTs per batch; never schedule after an error or unclear save result.
      if (moreFresh && done===2 && sameRoute(s) && !syncTimer) {
        syncTimer=setTimeout(()=>{
          syncTimer=0;
          synchronizeRecent().catch(()=>{});
        },35000);
      }
    } catch { /* Not authorized/offline/changed: fail closed, no retry storm. */ }
    finally {syncBusy=false;}
  }
  function onKeeperChanged(changes,area) {
    if(area!=='local'||!changes?.contextKeeperData || Date.now()-lastAutoRun<30000) return;
    clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>{syncTimer=0;synchronizeRecent().catch(()=>{});},8000);
  }
  function manageSyncSubscription(enabled) {
    const wanted=enabled && settings().privateLorebookAllowArchiveAutoSync===true &&
      settings().privateLorebookSyncMode==='on-change' && ['hybrid','archive'].includes(settings().privateLorebookStorageMode);
    if (wanted&&!syncSubscribed) {chrome.storage.onChanged.addListener(onKeeperChanged);syncSubscribed=true;}
    else if(!wanted&&syncSubscribed) {chrome.storage.onChanged.removeListener(onKeeperChanged);syncSubscribed=false;clearTimeout(syncTimer);syncTimer=0;}
  }
  // Never add a button to the chat header. A chat URL alone does not establish
  // ownership or the presence of an attached private Lorebook.
  DS.openPrivateLorebookBridge=show;
  DS.offerPrivateLorebookAction=async function(dialog, actions) {
    if (!(dialog instanceof Element) || !(actions instanceof Element) ||
        settings().enabled!==true || settings().enablePrivateLorebookBridge!==true) return;
    const s=scope();if(!s)return;
    try {
      await verifyBot(s);
      if (!dialog.isConnected || !sameRoute(s) || dialog.querySelector('[data-ds-private-lb-action]')) return;
      const launch=node('button','Private Lorebook','ds-private-lb-action');
      launch.type='button';launch.dataset.dsPrivateLbAction='1';
      launch.title='Review this private bot\'s verified, attached private Lorebook';
      launch.addEventListener('click',show);
      actions.append(launch);
    } catch { /* Missing attachment, public bot/book, or unknown owner: no button. */ }
  };
  DS.applyPrivateLorebookBridge=function() {
    const enabled=settings().enabled===true && settings().enablePrivateLorebookBridge===true;
    manageSyncSubscription(enabled);
    document.getElementById(BUTTON)?.remove(); // remove old v0.2.57 injected header controls
    if (!enabled) {document.getElementById(MODAL)?.remove();return;}
    if (/^\/lorebook\/edit\/[0-9a-f-]{36}\/entries\/?$/i.test(location.pathname)) {
      handoff().catch(()=>{});
      DS.applyPrivateArchiveEntryHandoff?.().catch(()=>{});
    }
  };
})();
}
