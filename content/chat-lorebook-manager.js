// Opt-in draft editor for Chat / Memory -> Lorebook. Does not use an
// undocumented private endpoint or modify a user's actual lorebook without review.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const KEY = 'dsQolChatLorebookDraftsV1';
  const PENDING_KEY = 'dsQolChatLorebookPendingEntryV1';
  const MODAL = 'ds-chat-lorebook-modal';
  const MAX_ENTRIES = 200;
  const clamp = (v, limit) => String(v || '').trim().slice(0, limit);
  const chatId = () => DS.getCurrentChatScope?.()?.key || ''; // distinct saved conversations, not the shared bot ID
  function storageGet() { return new Promise(resolve => chrome.storage.local.get([KEY], data => resolve(data?.[KEY] || {}))); }
  // All local Lorebook writes use one serialized background transaction across
  // tabs. Reading a snapshot then calling storage.local.set here is not safe.
  function mutate(op, chatId, details={}) {
    return new Promise((resolve,reject)=>{
      chrome.runtime.sendMessage({type:'DS_CHAT_LOREBOOK_MUTATE',op,chatId,...details},response=>{
        if(chrome.runtime.lastError)return reject(new Error(chrome.runtime.lastError.message));
        if(!response?.ok)return reject(new Error(response?.error||'Local Lorebook write was not confirmed.'));
        resolve(response.result);
      });
    });
  }
  DS.localLorebookMutate=mutate;
  const $ = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; return el; };
  function download(filename, text) {
    const blob = new Blob([text], {type: 'application/json;charset=utf-8'});
    const href = URL.createObjectURL(blob); const a = $('a'); a.href = href; a.download = filename;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 1500);
  }
  function field(parent, title, kind, value, limit) {
    const label = $('label'); label.textContent = title;
    const input = $(kind); input.value = value || ''; input.maxLength = limit;
    label.append(input); parent.append(label); return input;
  }
  function sourceText(message) {
    // Only the visible, native message text. Avoid exporting toolbar labels,
    // edit controls, token counters or hidden state from the message card.
    const nodes = [...message.querySelectorAll('div.whitespace-pre-wrap,div[class*="break-words"],div[class*="overflow-wrap"]')];
    const best = nodes.sort((a,b) => (b.innerText || '').length - (a.innerText || '').length)[0];
    if (best) return clamp(best.innerText || best.textContent || '', 2000);
    const copy = message.cloneNode(true);
    copy.querySelectorAll('button,svg,img,.ds-message-lorebook-button,.ds-message-action-row,[role="menu"]').forEach(n => n.remove());
    return clamp(copy.innerText || copy.textContent || '', 2000);
  }
  function copy(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const box = $('textarea'); box.value = text; document.body.append(box); box.select();
    const ok = document.execCommand('copy'); box.remove(); return Promise.resolve(ok);
  }
  // Only the bot's *actual attached* private owned Lorebook is eligible for
  // this native-editor handoff. No arbitrary URL or public editor bypass.
  async function verifyQueuedLorebook(pending) {
    const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!UUID.test(pending.botId)||!UUID.test(pending.conversationId)||!UUID.test(pending.targetId))
      throw Error('Invalid private Lorebook association.');
    const api=DS.privateLorebookAuth?.request;
    if(typeof api!=='function')throw Error('Private Lorebook ownership verification is unavailable.');
    const user=await api('/v2/users');const accountId=user?.user?.id;
    if(!accountId||pending.accountId&&pending.accountId!==accountId)throw Error('Signed-in account is different.');
    const bot=await api(`/v2/characters/${pending.botId}?include=rulebook`);
    if(String(bot?.id||'').toLowerCase()!==pending.botId||bot.creator_user_id!==accountId||
       !['hidden','private'].includes(bot.visibility)||!Array.isArray(bot.lorebooks)||bot.lorebooks.length!==1||
       String(bot.lorebooks[0]?.id||'').toLowerCase()!==pending.targetId)
      throw Error('This private bot does not own and attach the requested Lorebook.');
    const lorebook=await api(`/lorebooks/${pending.targetId}?sortBy=priority&lastSortPriority=0`);
    if(String(lorebook?.id||'').toLowerCase()!==pending.targetId||
       lorebook.creator_user_id!==accountId||lorebook.visibility!=='private')
      throw Error('The attached Lorebook is not private and owned by this account.');
    return accountId;
  }
  async function showEditor(initial = '') {
    document.getElementById(MODAL)?.remove();
    const id = chatId(); if (!id) return;
    const overlay = $('div','ds-chat-lorebook-overlay'); overlay.id = MODAL;
    const dialog = $('div','ds-chat-lorebook-dialog');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Lorebook draft editor');
    dialog.append($('h2','','Chat Lorebook Manager'),$('p','ds-lb-description','Review and save a private local draft. Nothing will be published or attached automatically.'),$('p','ds-lb-description','Experimental — test and review entries before relying on keyword recall; keep a backup of important lore.'));
    // Native bot-level attachment route verified against chatbot create-form captures.
    // It is intentionally guidance only: the captures do not establish an API or
    // control for attaching a personal lorebook to somebody else's existing chat.
    const attachHelp = $('details', 'ds-lb-attach-help');
    attachHelp.append($('summary', '', 'How to attach a lorebook to your own chatbot'));
    attachHelp.append($('p', '', 'In SpicyChat’s chatbot editor, open Advanced → Lorebook → Attach Lorebook, choose a lorebook and save the chatbot using SpicyChat’s own controls. Once attached, that area shows Replace Lorebook. This attaches a lorebook to a chatbot, not to an individual conversation; saving an entry draft here does not attach it.'));
    dialog.append(attachHelp);
    const title = field(dialog, 'Entry name (max 50)', 'input', '', 50);
    const keywords = field(dialog, 'Keywords (comma-separated, max 12)', 'input', '', 600);
    const content = field(dialog, 'Content (max 2000)', 'textarea', initial, 2000);
    // Local Lorebook entries have a stable ID. Historic draft records are kept and
    // are indexed by their original position until their first reviewed edit.
    const suggestionRow=$('div','ds-lb-draft-actions');
    const suggest=$('button','','Review Context Keeper suggestions');suggest.type='button';
    suggest.addEventListener('click',async()=>{
      try {
        if(DS.state?.settings?.enableContextLorebookSuggestions!==true)throw Error('Enable reviewed Context Keeper suggestions in QoL Settings first.');
        if(typeof DS.openContextLorebookProposalReview!=='function')throw Error('Suggestion module is not installed.');
        await DS.openContextLorebookProposalReview();
      }catch(error){window.alert(String(error?.message||error));}
    });suggestionRow.append(suggest);dialog.append(suggestionRow);
    const storedEntries = $('div','ds-lb-local-entries');
    const selectedLabel = $('label');selectedLabel.textContent='Saved entries for this conversation';
    const selected = $('select');selected.setAttribute('aria-label','Saved local lorebook entries');
    selectedLabel.append(selected);storedEntries.append(selectedLabel);
    const entryActions=$('div','ds-lb-draft-actions');
    const localStatus=$('p','ds-lb-draft-status');localStatus.setAttribute('role','status');
    storedEntries.append(entryActions,localStatus);dialog.append(storedEntries);
    let currentEntryId='';
    // Values are stable entry IDs (or a legacy positional key), never a live
    // list index. A saved snapshot catches stale edits from another tab.
    const entrySnapshots=new Map();
    function entryKey(entry,index) { return entry?.entryId ? `id:${entry.entryId}` : `legacy:${index}`; }
    function locateEntry(list,key) {
      if(key.startsWith('id:')){
        const id=key.slice(3);
        const matching=list.map((entry,index)=>({entry,index})).filter(item=>item.entry?.entryId===id);
        return matching.length===1?matching[0]:null;
      }
      const match=/^legacy:(\d+)$/.exec(key);
      const index=match?Number(match[1]):-1;
      return index>=0&&index<list.length&&!list[index]?.entryId?{entry:list[index],index}:null;
    }
    async function refreshSavedEntries(pick='') {
      const oldSelection=selected.value;
      const all=await storageGet(); const list=Array.isArray(all[id])?all[id]:[];
      const available=new Map();
      const placeholder=$('option','','Select a saved entry');placeholder.value='';
      const options=[placeholder];
      list.forEach((entry,index)=>{
        const key=entryKey(entry,index);
        const option=$('option','',`${entry.disabled?'[Inactive] ':''}${entry.name||'Untitled'}${entry.pinned?' ★':''}`);
        option.value=key;options.push(option);
        available.set(key,JSON.stringify(entry));
      });
      selected.replaceChildren(...options);
      entrySnapshots.clear(); for(const [key,value] of available) entrySnapshots.set(key,value);
      const desired=pick ? (pick.startsWith('id:')||pick.startsWith('legacy:')?pick:`id:${pick}`) : oldSelection;
      if(desired&&available.has(desired))selected.value=desired;
      localStatus.textContent=`${list.length} saved entries in this conversation. Changes remain local until explicitly transferred.`;
      return {all,list};
    }
    const takeSelection=async()=>{
      const key=selected.value;
      const expected=entrySnapshots.get(key);
      if(!key||!expected)return null;
      if(chatId()!==id)throw Error('Conversation changed; reopen the local Lorebook editor.');
      const all=await storageGet(), list=Array.isArray(all[id])?all[id]:[];
      const found=locateEntry(list,key);
      if(!found||JSON.stringify(found.entry)!==expected){
        await refreshSavedEntries();
        throw Error('This entry changed in another tab. Reload it before making changes.');
      }
      return {all,list,index:found.index,record:found.entry,key};
    };
    const addLocalAction=(label,handler)=>{const b=$('button','',label);b.type='button';b.addEventListener('click',()=>Promise.resolve(handler()).catch(error=>localStatus.textContent=String(error?.message||error)));entryActions.append(b);};
    addLocalAction('Load selected',async()=>{
      const data=await takeSelection();if(!data)return;
      const entry=data.record;
      title.value=entry.name||'';keywords.value=(entry.keywords||[]).join(', ');content.value=entry.content||'';
      currentEntryId=entry.entryId||data.key;
      localStatus.textContent=`Loaded “${entry.name||'Untitled'}”. Review before updating.`;
    });
    addLocalAction('Update selected',async()=>{
      const data=await takeSelection();if(!data)return;
      const name=clamp(title.value,50),text=clamp(content.value,2000);
      if(!name||!text)throw Error('Name and content are required.');
      const keys=[...new Map(keywords.value.split(',').map(v=>v.trim()).filter(Boolean).map(v=>[v.toLowerCase(),v])).values()].slice(0,12);
      const history=Array.isArray(data.record.revisionHistory)?data.record.revisionHistory.slice(-7):[];
      if(data.record.name!==name||data.record.content!==text||JSON.stringify(data.record.keywords||[])!==JSON.stringify(keys)){
        history.push({at:Date.now(),name:clamp(data.record.name,50),content:clamp(data.record.content,2000),
          keywords:(data.record.keywords||[]).slice(0,12),sourceDetailIds:(data.record.sourceDetailIds||[]).slice(0,30)});
      }
      const updated={...data.record,name,content:text,keywords:keys,revisionHistory:history.slice(-8),
        entryId:data.record.entryId||crypto.randomUUID(),updatedAt:Date.now()};
      if(!confirm(`Update local entry “${data.record.name}”? This will replace its local content.`))return;
      if(chatId()!==id)throw Error('Conversation changed during editing.');
      const latest=await storageGet();
      const fresh=locateEntry(Array.isArray(latest[id])?latest[id]:[],data.key);
      if(!fresh||JSON.stringify(fresh.entry)!==JSON.stringify(data.record))throw Error('Entry changed while you reviewed it. Reload before updating.');
      await mutate('replace',id,{key:data.key,expected:JSON.stringify(data.record),record:updated});
      currentEntryId=updated.entryId;await refreshSavedEntries(currentEntryId);
      localStatus.textContent='Saved the reviewed local entry update.';
    });
    addLocalAction('Restore last local revision (inactive)',async()=>{
      const data=await takeSelection();if(!data)return;
      const history=Array.isArray(data.record.revisionHistory)?data.record.revisionHistory:[];
      if(!history.length)throw Error('There are no saved local revisions for this entry.');
      const prior=history[history.length-1];
      if(!prior?.name||!prior?.content)throw Error('The previous revision is incomplete. No changes made.');
      if(!confirm(`Restore the previous version of “${data.record.name}” as INACTIVE? This will not change native Lorebooks or reactivate old canon.`))return;
      if(chatId()!==id)throw Error('Conversation changed during restore.');
      const latest=await storageGet();
      const fresh=locateEntry(Array.isArray(latest[id])?latest[id]:[],data.key);
      if(!fresh||JSON.stringify(fresh.entry)!==JSON.stringify(data.record))throw Error('Entry changed while reviewing history. Refresh first.');
      if(latest[id].some((row,index)=>index!==fresh.index &&
        (clamp(row.name,50).toLowerCase()===clamp(prior.name,50).toLowerCase() ||
         clamp(row.content,2000).toLowerCase()===clamp(prior.content,2000).toLowerCase())))
        throw Error('Restoring this revision would duplicate another local entry. Resolve it manually first.');
      const next={...fresh.entry,entryId:fresh.entry.entryId||crypto.randomUUID(),
        name:clamp(prior.name,50),content:clamp(prior.content,2000),
        keywords:Array.isArray(prior.keywords)?prior.keywords.slice(0,12):[],
        disabled:true,updatedAt:Date.now(),
        revisionHistory:[...history.slice(0,-1),{at:Date.now(),name:clamp(fresh.entry.name,50),
          content:clamp(fresh.entry.content,2000),keywords:(fresh.entry.keywords||[]).slice(0,12),
          sourceDetailIds:(fresh.entry.sourceDetailIds||[]).slice(0,30)}].slice(-8)};
      await mutate('replace',id,{key:data.key,expected:JSON.stringify(data.record),record:next});
      await refreshSavedEntries(next.entryId);
      localStatus.textContent='Previous local wording restored as INACTIVE. Review before activating; no native Lorebook was changed.';
    });
    addLocalAction('Activate / deactivate',async()=>{
      const data=await takeSelection();if(!data)return;
      const next={...data.record,entryId:data.record.entryId||crypto.randomUUID(),disabled:!data.record.disabled,updatedAt:Date.now()};
      if(chatId()!==id)throw Error('Conversation changed during editing.');
      const latest=await storageGet();
      const fresh=locateEntry(Array.isArray(latest[id])?latest[id]:[],data.key);
      if(!fresh||JSON.stringify(fresh.entry)!==JSON.stringify(data.record))throw Error('Entry changed; reload before editing.');
      await mutate('replace',id,{key:data.key,expected:JSON.stringify(data.record),record:next});
      await refreshSavedEntries(next.entryId);
      localStatus.textContent=next.disabled?'Entry deactivated; it will not trigger.':'Entry activated.';
    });
    addLocalAction('Pin / unpin',async()=>{
      const data=await takeSelection();if(!data)return;
      const next={...data.record,entryId:data.record.entryId||crypto.randomUUID(),pinned:!data.record.pinned,updatedAt:Date.now()};
      if(chatId()!==id)throw Error('Conversation changed during editing.');
      const latest=await storageGet();
      const fresh=locateEntry(Array.isArray(latest[id])?latest[id]:[],data.key);
      if(!fresh||JSON.stringify(fresh.entry)!==JSON.stringify(data.record))throw Error('Entry changed; reload before editing.');
      await mutate('replace',id,{key:data.key,expected:JSON.stringify(data.record),record:next});
      await refreshSavedEntries(next.entryId);
    });
    addLocalAction('Delete selected',async()=>{
      const data=await takeSelection();if(!data)return;
      if(!confirm(`Permanently delete the LOCAL entry “${data.record.name}”? This cannot delete any native Lorebook entry.`))return;
      if(chatId()!==id)throw Error('Conversation changed during editing.');
      const latest=await storageGet();
      const fresh=locateEntry(Array.isArray(latest[id])?latest[id]:[],data.key);
      if(!fresh||JSON.stringify(fresh.entry)!==JSON.stringify(data.record))throw Error('Entry changed; reload before deleting.');
      await mutate('delete',id,{key:data.key,expected:JSON.stringify(data.record)});
      currentEntryId='';await refreshSavedEntries();
    });
    const triggerTest=field(dialog,'Test keyword triggers (no messages sent)','textarea','',600);
    const matchPreview=$('p','ds-lb-draft-status');matchPreview.setAttribute('role','status');dialog.append(matchPreview);
    addLocalAction('Test keywords',async()=>{
      const data=await new Promise((resolve,reject)=>chrome.storage.local.get([KEY,'contextKeeperData'],value=>
        chrome.runtime.lastError?reject(new Error(chrome.runtime.lastError.message)):resolve(value||{})));
      const list=Array.isArray(data[KEY]?.[id])?data[KEY][id].slice(-200):[];
      const facts=new Map((data.contextKeeperData?.[id]?.details||[]).filter(f=>f?.id).map(f=>[f.id,f]));
      const normalize=s=>String(s||'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
      const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const message=normalize(triggerTest.value);
      const eligible=entry=>{
        if(!entry||entry.disabled||!entry.name||!entry.content||!Array.isArray(entry.keywords))return false;
        if(entry.source==='context-keeper'||(entry.sourceDetailIds||[]).length){
          const sources=Array.isArray(entry.sourceDetailIds)?entry.sourceDetailIds:[];
          if(!sources.length||!sources.every(source=>{
            const fact=facts.get(source);
            return fact&&fact.enabled!==false&&!fact.needsReview&&!fact.supersededBy&&
              typeof entry.sourceSnapshots?.[source]==='string'&&
              String(fact.text||'').trim()===entry.sourceSnapshots[source];
          }))return false;
        }
        return true;
      };
      let skippedOutdated=0;
      const candidates=[];
      for(const entry of list){
        if(!eligible(entry)){
          if(!entry?.disabled && (entry?.source==='context-keeper'||(entry?.sourceDetailIds||[]).length))skippedOutdated++;
          continue;
        }
        let score=0;
        for(const word of entry.keywords){
          const key=normalize(word);if(!key||key.length>80)continue;
          // Same Unicode phrase boundaries as the live outgoing recall engine.
          try{if(new RegExp(`(^|[^\\p{L}\\p{N}])${escape(key)}(?=$|[^\\p{L}\\p{N}])`,'u').test(message))
            score=Math.max(score,key.length);}catch{}
        }
        if(score)candidates.push({entry,score});
      }
      candidates.sort((a,b)=>Number(b.entry.pinned===true)-Number(a.entry.pinned===true)||
        b.score-a.score||Number(b.entry.updatedAt||0)-Number(a.entry.updatedAt||0));
      const recallEnabled=DS.state?.settings?.enableLocalLorebookRecall===true;
      const max=Math.max(200,Math.min(1400,Number(DS.state?.settings?.localLorebookRecallMaxChars)||900));
      const prefix='[OOC: Local lorebook facts for this specific conversation (reference only; preserve character knowledge and user agency): ';
      let used=prefix.length+1,accepted=[],skippedBudget=0,skippedMax=0;
      for(const {entry} of candidates){
        if(accepted.length>=4){skippedMax++;continue;}
        const piece=`${String(entry.name||'').slice(0,50).replace(/[\r\n\[\]]/g,' ')}: ${String(entry.content||'').slice(0,2000).replace(/[\[\]]/g,' ').replace(/\s+/g,' ').trim()}`;
        const next=used+piece.length+(accepted.length?3:0);
        if(next>max){skippedBudget++;continue;}
        accepted.push(entry.name);used=next;
      }
      matchPreview.textContent=(candidates.length?`Matched ${candidates.length}: ${candidates.map(x=>x.entry.name).join(', ')}.`:'No active local keyword matches.')+
        ` Would insert ${accepted.length} (${used}/${max} characters including OOC wrapper).`+
        (skippedBudget?` ${skippedBudget} skipped by budget.`:'')+
        (skippedMax?` ${skippedMax} skipped by four-entry limit.`:'')+
        (skippedOutdated?` ${skippedOutdated} outdated/unreviewed linked entries excluded.`:'')+
        (!recallEnabled?' Automatic recall is currently OFF.':'')+
        ' Preview only; nothing sent or changed on SpicyChat.';
    });
    void refreshSavedEntries().catch(()=>{});
    const book = field(dialog, 'Optional existing lorebook editor URL', 'input', '', 240);
    book.placeholder = 'https://spicychat.ai/lorebook/edit/.../entries';
    const state = $('p','ds-lb-draft-status');state.setAttribute('role','status');dialog.append(state);
    const actions = $('div','ds-lb-draft-actions');
    function add(text, handler) {const b = $('button','',text);b.type='button';b.addEventListener('click', handler);actions.append(b);return b;}
    add('Cancel', () => overlay.remove());
    add('Copy entry', async () => {
      const serialized = `Name: ${clamp(title.value,50)}\nKeywords: ${keywords.value}\nContent: ${content.value}`;
      try { await copy(serialized);state.textContent='Copied. Paste into the native lorebook entry editor.'; } catch { state.textContent='Could not access clipboard; select and copy the fields manually.'; }
    });
    add('Queue in existing lorebook', async () => {
      const raw=book.value.trim();
      let u;try{u=new URL(raw);}catch{state.textContent='Enter a valid existing Lorebook editor URL first.';return;}
      const match=u.pathname.match(/^\/lorebook\/edit\/([0-9a-f-]{36})(?:\/entries)?\/?$/i);
      if(u.protocol!=='https:'||!['spicychat.ai','www.spicychat.ai'].includes(u.hostname)||!match){
        state.textContent='Only a SpicyChat Lorebook editor URL is accepted.';return;
      }
      const s=DS.getCurrentChatScope?.();
      if(!s?.persisted||!s.botId||!s.conversationId||chatId()!==id){
        state.textContent='Open a saved conversation before preparing a native Lorebook entry.';return;
      }
      const name=clamp(title.value,50),text=clamp(content.value,2000);
      const names=[...new Map(keywords.value.split(',').map(x=>x.trim()).filter(Boolean).map(x=>[x.toLowerCase(),x])).values()].slice(0,12);
      if(!name||!text||!names.length){state.textContent='Name, content and a specific keyword are required.';return;}
      if(!confirm(`Verify private ownership and prepare “${name}” for review in the attached Lorebook? QoL will not press Save.`))return;
      state.textContent='Checking private ownership and attachment…';
      try {
        const pending={schema:2,targetId:match[1].toLowerCase(),name,keywords:names,content:text,
          botId:String(s.botId).toLowerCase(),conversationId:String(s.conversationId).toLowerCase(),queuedAt:Date.now(),nonce:crypto.randomUUID()};
        const owner=await verifyQueuedLorebook(pending);
        if(chatId()!==id)throw Error('Conversation changed during verification.');
        pending.accountId=owner;
        const existing=await new Promise(resolve=>chrome.storage.local.get([PENDING_KEY],v=>resolve(v?.[PENDING_KEY]||null)));
        if(existing&&Date.now()-Number(existing.queuedAt||0)<30*60*1000)
          throw Error('A native entry draft is already queued. Review or discard it before queueing another.');
        await new Promise((resolve,reject)=>chrome.storage.local.set({[PENDING_KEY]:pending},()=>chrome.runtime.lastError?reject(Error(chrome.runtime.lastError.message)):resolve()));
        state.textContent='Ownership verified and draft queued. Use Open lorebook editor, then Review queued entry; SpicyChat Save stays manual.';
      }catch(error){state.textContent=String(error?.message||error);}
    });
    add('My Lorebooks', () => {
      // Confirmed native My Creations route; site handles ownership/visibility.
      window.open(`${location.origin}/my-creations/lorebooks`,'_blank','noopener,noreferrer');
    });
    add('Open lorebook editor', () => {
      const raw=book.value.trim();
      let u; try {u=new URL(raw);}catch {state.textContent='Enter a valid existing lorebook editor URL first.';return;}
      if (!['spicychat.ai','www.spicychat.ai'].includes(u.hostname) || u.protocol !== 'https:' ||
          !/^\/lorebook\/edit\/[0-9a-f-]{36}(?:\/entries)?\/?$/i.test(u.pathname)) {
        state.textContent='Only an existing SpicyChat lorebook edit link is accepted.';return;
      }
      window.open(u.href,'_blank','noopener,noreferrer');
    });
    add('Save local draft', async () => {
      const name=clamp(title.value,50), text=clamp(content.value,2000);
      if (!name || !text) {state.textContent='Entry name and content are required.';return;}
      const names = [...new Map(keywords.value.split(',').map(x => x.trim()).filter(Boolean).map(x => [x.toLowerCase(),x])).values()].slice(0,12);
      const record={name,keywords:names,content:text,chatId:id,createdAt:Date.now(),schema:1};
      try {
        const all=await storageGet(); const list=Array.isArray(all[id])?all[id]:[];
        if(list.length>=MAX_ENTRIES){state.textContent=`This conversation has ${MAX_ENTRIES} local entries. Export or remove an older entry before adding another; none were discarded.`;return;}
        record.entryId=crypto.randomUUID();record.disabled=false;record.pinned=false;record.updatedAt=record.createdAt;
        const saved=await mutate('create',id,{record});
        await refreshSavedEntries(record.entryId);
        state.textContent=`Saved local lorebook entry (${saved.total} for this conversation). It remains editable, with optional keyword recall.`;
      } catch(error) {state.textContent='Could not save draft: '+String(error?.message||error);}
    });
    add('Load most recent', async () => {
      const list=(await storageGet())[id]||[];
      const last=list.at(-1);
      if (!last) {state.textContent='No draft saved for this chat.';return;}
      title.value=last.name||'';keywords.value=(last.keywords||[]).join(', ');content.value=last.content||'';
      state.textContent='Loaded the most recent draft; edit and save it as a new revision.';
    });
    // Imported backups are conversation-bound and always start inactive;
    // the user must inspect each entry before enabling keyword recall.
    const importFile=$('input');importFile.type='file';importFile.accept='.json,application/json';importFile.hidden=true;
    importFile.addEventListener('change',async()=>{
      const file=importFile.files?.[0];importFile.value='';if(!file)return;
      try {
        if(file.size>3*1024*1024)throw Error('Backup exceeds the 3 MB local import limit.');
        const parsed=JSON.parse(await file.text());
        if(parsed?.schema!=='dsq-chat-lorebook-drafts/v1'||parsed.chatId!==id||!Array.isArray(parsed.entries))
          throw Error('This backup does not belong to the current conversation. No entries imported.');
        if(parsed.entries.length>200)throw Error('Backup contains too many local entries.');
        const valid=parsed.entries.map(entry=>{
          if(typeof entry?.name!=='string'||!entry.name.trim()||entry.name.length>50||
             typeof entry.content!=='string'||!entry.content.trim()||entry.content.length>2000||
             !Array.isArray(entry.keywords)||entry.keywords.length>12||
             entry.keywords.some(k=>typeof k!=='string'||k.length>80))
            throw Error('Backup contains an invalid entry. Nothing was imported.');
          return {name:entry.name.trim(),content:entry.content.trim(),keywords:[...new Set(entry.keywords.map(x=>x.trim()).filter(Boolean))],
            schema:1,chatId:id,entryId:crypto.randomUUID(),disabled:true,pinned:entry.pinned===true,
            source:'import',createdAt:Date.now(),updatedAt:Date.now()};
        });
        if(chatId()!==id)throw Error('Conversation changed while reading the backup.');
        const all=await storageGet(),before=Array.isArray(all[id])?all[id]:[];
        const hashes=new Set(before.map(r=>JSON.stringify([String(r.name||'').toLowerCase(),String(r.content||'')])));
        const additions=[];
        for(const record of valid){const hash=JSON.stringify([record.name.toLowerCase(),record.content]);
          if(hashes.has(hash))continue;hashes.add(hash);additions.push(record);}
        if(!additions.length){state.textContent='No new entries in this backup.';return;}
        if(before.length+additions.length>MAX_ENTRIES)throw Error('Not enough space in this conversation’s 200-entry local Lorebook.');
        if(!confirm(`Import ${additions.length} new local entries into THIS conversation? They will all start inactive for review.`))return;
        if(chatId()!==id)throw Error('Conversation changed before import.');
        const latest=await storageGet(),existing=Array.isArray(latest[id])?latest[id]:[];
        if(JSON.stringify(existing)!==JSON.stringify(before))throw Error('Local entries changed in another tab. Retry the import.');
        const result=await mutate('import',id,{records:additions});
        await refreshSavedEntries();state.textContent=`Imported ${result.count} inactive entries. Review them before activation.`;
      }catch(error){state.textContent=String(error?.message||error);}
    });
    dialog.append(importFile);
    add('Import chat backup (.json)',()=>importFile.click());
    add('Export chat drafts', async () => {
      const list=(await storageGet())[id]||[];
      if (!list.length) {state.textContent='No saved drafts for this chat.';return;}
      download('spicychat-lorebook-drafts-'+id.slice(0,8)+'.json',JSON.stringify({schema:'dsq-chat-lorebook-drafts/v1',chatId:id,entries:list},null,2));
    });
    dialog.append(actions);overlay.append(dialog);document.body.append(overlay);
    const closeEvent = event => { if (event.key === 'Escape') {overlay.remove();document.removeEventListener('keydown',closeEvent);} };
    document.addEventListener('keydown',closeEvent);
    overlay.addEventListener('click',event=>{if(event.target===overlay)overlay.remove()});
    title.focus();
  }
  let lastMemoryButtonScan = 0;
  let lastMemoryManager = null;
  function memoryButtons() {
    const manager = document.querySelector('[data-testid="ChatMemoryManagerCapabilityGate"]');
    if (!manager) {lastMemoryManager=null;return;}
    // SpicyChat can rerun chat decorations many times per second. A fresh
    // manager is processed immediately, while an unchanged one is bounded to
    // one scan/second. Native Memory changes still become visible shortly.
    const now = Date.now();
    if (manager===lastMemoryManager && now-lastMemoryButtonScan<1000) return;
    lastMemoryManager=manager;
    lastMemoryButtonScan=now;
    const triggers=[...manager.querySelectorAll('button[data-slot="trigger"][aria-haspopup="true"]')].slice(0,100);
    for (const trigger of triggers) {
      let row=trigger.parentElement;
      for (let i=0;row&&row!==manager&&i<7; i++,row=row.parentElement) {
        const text=row.querySelector('div[class*="overflow-wrap"] span');
        if (!text || row.querySelectorAll('button[data-slot="trigger"][aria-haspopup="true"]').length !== 1) continue;
        if (!row.querySelector(':scope > .ds-memory-lorebook-button')) {
          const btn=$('button','ds-memory-lorebook-button','To Lorebook');btn.type='button';btn.title='Save this memory as a lorebook draft';
          btn.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();showEditor(clamp(text.textContent,2000));});
          row.append(btn);
        }
        break;
      }
    }
  }
  let recentRootsScope = '';
  let recentRootsScannedAt = 0;
  let cachedRecentRoots = [];
  function messageButtons() {
    // Only new/dirty lane roots need inspection on routine passes. An older
    // toolbar may be remounted during native history loading, so recheck the
    // last 12 mounted messages at a bounded interval rather than every pass.
    const lane=DS.getCurrentMessageLaneRoots?.()||[];
    const now=Date.now(), currentScope=chatId();
    if (recentRootsScope!==currentScope || now-recentRootsScannedAt>=8000) {
      cachedRecentRoots=(DS.getLoadedMessageRoots?.()||[]).slice(-12);
      recentRootsScannedAt=now;
      recentRootsScope=currentScope;
    }
    const messages=[...new Set([...lane,...cachedRecentRoots])].filter(el=>el?.isConnected).slice(-24);
    for (const msg of messages) {
      if (msg.querySelector('.ds-message-lorebook-button')) continue;
      const toolbar = msg.querySelector('div.flex.justify-between.items-center') || msg;
      const button = $('button','ds-message-lorebook-button','To Lorebook');
      button.type='button';button.title='Create lorebook draft from this message';
      button.addEventListener('click',event => {
        event.preventDefault();event.stopPropagation();showEditor(sourceText(msg));
      });
      toolbar.append(button);
    }
  }
  function chatAction() {
    if (document.getElementById('ds-chat-lorebook-action')) return;
    const header=document.querySelector('a[aria-label="chatbot-profile"]')?.parentElement;
    if (!header) return;
    const button=$('button','ds-chat-lorebook-action','Lorebook draft');button.id='ds-chat-lorebook-action';button.type='button';
    button.addEventListener('click',()=>showEditor());header.append(button);
  }
  let pendingReadInFlight = false;
  let pendingCheckAt = 0;
  function setNativeValue(field, text) {
    if (!field) return;
    const proto=field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
    if(setter) setter.call(field, text); else field.value=text;
    field.dispatchEvent(new Event('input',{bubbles:true}));
    field.dispatchEvent(new Event('change',{bubbles:true}));
  }
  async function reviewPendingEntry(pending, banner) {
    try {
      if(pending.schema!==2||Date.now()-pending.queuedAt>30*60*1000)throw Error('Old or unverified draft.');
      const latest=await new Promise(resolve=>chrome.storage.local.get([PENDING_KEY],v=>resolve(v?.[PENDING_KEY]||null)));
      if(!latest||latest.nonce!==pending.nonce||location.pathname.toLowerCase().indexOf('/'+pending.targetId+'/entries')===-1)
        throw Error('Queued draft or Lorebook editor changed.');
      await verifyQueuedLorebook(pending);
    }catch(error){banner.title=String(error?.message||error);return;}
    const add=document.querySelector("[data-testid='EntriesCreateHeader-AddEntryButton']");
    if(!add) {banner.title='Native Add Entry is not available on this page.';return;}
    add.click();
    // Wait only in response to the user's explicit button click.
    let name, content;
    for(let i=0;i<20;i++) {
      name=[...document.querySelectorAll('input[name="name"]')].find(el=>el.getClientRects().length);
      content=[...document.querySelectorAll('textarea[name="content"]')].find(el=>el.getClientRects().length);
      if(name && content)break;
      await new Promise(resolve=>setTimeout(resolve,110));
    }
    if(!name || !content) {banner.title='Could not find the native entry editor.';return;}
    setNativeValue(name,clamp(pending.name,50));
    setNativeValue(content,clamp(pending.content,2000));
    const form=content.closest('form')||content.parentElement;
    const keywordField=[...(form?.querySelectorAll('input')||[])].find(el=>el!==name && /keyword|tag/i.test(el.placeholder||''));
    if(keywordField) {
      for(const keyword of (pending.keywords||[]).slice(0,12)) {
        setNativeValue(keywordField,clamp(keyword,80));
        keywordField.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
        keywordField.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
      }
    }
    // Clear only after native form fields were found and filled. User controls Save.
    chrome.storage.local.remove(PENDING_KEY,()=>{});
    banner.textContent='Draft filled. Review the native fields and press Save yourself.';
  }
  async function editorHandoff() {
    const route=location.pathname.match(/^\/lorebook\/edit\/([0-9a-f-]{36})\/entries\/?$/i);
    if(!route || document.getElementById('ds-chat-lorebook-pending')) return;
    if(pendingReadInFlight || Date.now()-pendingCheckAt<3500) return;
    pendingReadInFlight=true;pendingCheckAt=Date.now();
    try {
      const pending=await new Promise(resolve=>chrome.storage.local.get([PENDING_KEY],v=>resolve(v?.[PENDING_KEY])));
      if(!pending || pending.schema!==2 || pending.targetId!==route[1].toLowerCase() || Date.now()-pending.queuedAt>30*60*1000) return;
      const anchor=document.querySelector("[data-testid='EntriesCreateHeader-AddEntryButton']")?.parentElement;
      if(!anchor)return;
      const banner=$('div','ds-chat-lorebook-pending');banner.id='ds-chat-lorebook-pending';
      banner.append($('span','','Queued lorebook entry: '+clamp(pending.name,50)));
      const review=$('button','','Review queued entry');review.type='button';
      review.addEventListener('click',()=>reviewPendingEntry(pending,banner));banner.append(review);
      const discard=$('button','','Discard');discard.type='button';
      discard.addEventListener('click',()=>chrome.storage.local.remove(PENDING_KEY,()=>banner.remove()));banner.append(discard);
      anchor.append(banner);
    } finally {pendingReadInFlight=false;}
  }
  function cleanup() {
    lastMemoryManager=null;
    lastMemoryButtonScan=0;
    recentRootsScope='';
    recentRootsScannedAt=0;
    cachedRecentRoots=[];
    document.querySelectorAll('.ds-memory-lorebook-button,.ds-message-lorebook-button,#ds-chat-lorebook-action').forEach(el=>el.remove());
    document.getElementById(MODAL)?.remove();
  }
  // Explicit Context Keeper/Memory handoff. Never saves or attaches an entry.
  DS.openChatLorebookManager=initial=>{
    if(!DS.state?.settings?.enabled||!DS.state?.settings?.enableChatLorebookManager)return false;
    void showEditor(clamp(initial,2000));return true;
  };
  DS.applyChatLorebookManager=function applyChatLorebookManager() {
    if (!DS.state?.settings?.enabled || !DS.state?.settings?.enableChatLorebookManager) {cleanup();return;}
    if (/^\/lorebook\/edit\/[0-9a-f-]{36}\/entries\/?$/i.test(location.pathname)) {
      editorHandoff().catch(()=>{}); return;
    }
    if (!chatId()) {cleanup();return;}
    chatAction();memoryButtons();messageButtons();
  };
})();
}
