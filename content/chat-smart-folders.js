// Optional, explicit, metadata-only smart conversation folder scanner.
// No message history reads, no DOM observer, no continuous polling.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const KEY = 'dsQolSmartChatFoldersV1';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const clean = x => String(x ?? '').replace(/\s+/g, ' ').trim();
  const lower = x => clean(x).toLocaleLowerCase();
  const cfg = () => DS.state?.settings || {};
  const enabled = () => !!cfg().enabled && !!cfg().enableChatOrganizer && !!cfg().enableChatSmartFolders && !DS.isQolPausedForTab?.() && /^\/chats\/?$/i.test(location.pathname);
  const empty = () => ({ assignments:{}, lastScanAt:0, lastAppliedRules:'', known:[], botTags:{} });
  let state = empty(), loaded = false, loadPromise = null, run = null, pending = null, autoChecked = false;
  function storeGet() { return new Promise(resolve => chrome.storage.local.get(KEY, data => resolve(chrome.runtime.lastError ? {} : (data || {})))); }
  function storeSet(data) { return new Promise((resolve,reject) => chrome.storage.local.set({[KEY]:data}, () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve())); }
  const isFolder = x => !!x && x.length <= 48 && !/[\n<>\u0000-\u001f]/.test(x);
  function unpack(raw) {
    const safe = empty();
    if (!raw || typeof raw !== 'object') return safe;
    for (const [key,value] of Object.entries(raw.assignments || {}).slice(0,10000)) {
      if (!/^\/chat\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(key)) continue;
      const folders = [...new Set((Array.isArray(value) ? value : []).map(clean).filter(isFolder))].slice(0,10);
      if (folders.length) safe.assignments[key] = folders;
    }
    safe.lastScanAt = Math.max(0,Number(raw.lastScanAt)||0);
    safe.lastAppliedRules = clean(raw.lastAppliedRules).slice(0,10000);
    safe.known = [...new Set((Array.isArray(raw.known) ? raw.known : []).filter(x => UUID.test(x)))].slice(0,6000);
    safe.botTags = raw.botTags && typeof raw.botTags === 'object' ? raw.botTags : {};
    return safe;
  }
  async function ensure() {
    if (loaded) return state;
    if (!loadPromise) loadPromise = storeGet().then(data => {
      state = unpack(data[KEY]); loaded = true; DS.scheduleRun?.({priority:'slow',source:'chat-smart-folders-loaded'});
      return state;
    }).finally(()=>{loadPromise=null;});
    return loadPromise;
  }
  // Required identity is a full bot + conversation pair, never bot-only.
  function identity(item) {
    const bot = lower(item?.character_id || item?.characterId || item?.character?.id || item?.chatbot_id || item?.chatbotId);
    const convo = lower(item?.id || item?.conversation_id || item?.conversationId);
    if (!UUID.test(bot) || !UUID.test(convo)) return null;
    return { bot, convo, key:`/chat/${bot}/${convo}` };
  }
  const getName = v => clean(typeof v === 'string' ? v : v?.name || v?.label || v?.title || '');
  const extractTags = item => {
    const values = [item?.tags,item?.character?.tags,item?.chatbot?.tags,item?.bot?.tags,item?.character_tags,item?.characterTags];
    for (const v of values) {
      if (!Array.isArray(v)) continue;
      const names = [...new Set(v.map(getName).filter(Boolean).map(lower))];
      if (names.length) return names;
    }
    return [];
  };
  function persona(item) {
    const id = clean(item?.user_persona_id || item?.userPersonaId || item?.user_persona?.id || item?.userPersona?.id || item?.persona_id || item?.personaId || item?.persona?.id);
    const saved = UUID.test(id) ? (DS.state?.savedPersonas || []).find(v=>lower(v.id)===lower(id)) : null;
    const name = clean(item?.user_persona?.name || item?.userPersona?.name || item?.persona?.name || item?.persona_name || item?.personaName || saved?.name);
    return {id:UUID.test(id) ? id.toLowerCase() : '',name:lower(name)};
  }
  function rules() {
    const lines = String(cfg().smartChatFolderRules || '').split(/\r?\n/);
    const output=[];
    for (const [i,line] of lines.entries()) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const match=line.match(/^\s*(persona|tag)\s*:\s*(.+?)\s*=>\s*(.+?)\s*$/i);
      if (!match) throw new Error(`Rule ${i+1}: use persona: Name => Folder or tag: Name => Folder.`);
      const target=lower(match[2]);const folder=clean(match[3]);
      if (!target || !isFolder(folder)) throw new Error(`Rule ${i+1}: invalid match or folder (48 characters max).`);
      output.push({kind:match[1].toLowerCase(),match:target,folder});
      if (output.length>50) throw new Error('Maximum 50 Smart Folder rules.');
    }
    return output;
  }
  function signature(list) { return JSON.stringify(list); }
  const matches = (item, list, botTags) => {
    const person=persona(item);
    const tags = extractTags(item);
    if (!tags.length && botTags?.length) tags.push(...botTags);
    return [...new Set(list.filter(rule => rule.kind === 'persona'
      ? (rule.match === person.id || (person.name && rule.match === person.name))
      : tags.includes(rule.match)).map(rule=>rule.folder))];
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
  function status(text) { const node=document.querySelector('#ds-chat-smart-folders-status');if(node)node.textContent=String(text); }
  async function fetchTags(bot, job, cache, budget) {
    const cached=cache[bot];
    if(cached && Date.now()-Number(cached.at||0)<7*DAY_MS) return cached.tags||[];
    if (!cfg().smartChatFolderFetchBotTags || budget.value<=0 || !DS.fetchCharacterArchiveData) return [];
    budget.value--;
    if (job.cancelled || !enabled()) throw new Error('Scan cancelled.');
    try {
      const profile=await DS.fetchCharacterArchiveData(bot);
      const tags=[...new Set((profile?.tags||[]).map(getName).filter(Boolean).map(lower))];
      cache[bot]={tags,at:Date.now()};
      await sleep(350);
      return tags;
    } catch { return []; }
  }
  async function scan({daily=false}={}) {
    if(run || !enabled()) return;
    const list=rules();
    if(!list.length) { status('Add a persona or tag rule in QoL Settings first.'); return; }
    if(typeof DS.fetchConversationListPage!=='function') {status('The authenticated conversation-list reader is unavailable.');return;}
    await ensure();
    const active={cancelled:false,daily}; run=active; pending=null;
    const currentRules=signature(list);
    if(daily && (!state.lastAppliedRules || state.lastAppliedRules !== currentRules)) {run=null;return;}
    const assignments={};const seen=new Set();const eligibleKeys=[];const cache={...state.botTags}; const known=new Set(state.known);
    const budget={value:daily?2:12};
    const maxPages=daily?4:80;
    let cursor='',read=0,matched=0,unknownPersona=0,unknownTags=0,pages=0,stopReason='end of history';
    try {
      for(let page=0;page<maxPages;page++) {
        if(active.cancelled || !enabled() || !location.pathname.match(/^\/chats\/?$/i)) throw new Error('Scan cancelled.');
        // A hidden tab must not keep up a long background scan.
        while(document.hidden && !active.cancelled) {status(`Paused (tab hidden) · ${read} scanned`);await sleep(800);}
        if(active.cancelled) throw new Error('Scan cancelled.');
        const result=await DS.fetchConversationListPage({limit:25,lastId:cursor});
        if(!result?.ok || !Array.isArray(result.data)) throw new Error('SpicyChat conversation metadata unavailable.');
        pages++;
        if(!result.data.length) break;
        let newCount=0,oldCount=0;
        for(const item of result.data) {
          if(active.cancelled) throw new Error('Scan cancelled.');
          const id=identity(item);if(!id || seen.has(id.convo))continue;
          seen.add(id.convo);read++;
          if(!known.has(id.convo))newCount++; else oldCount++;
          const person=persona(item);if(!person.id && !person.name)unknownPersona++;
          let tags=extractTags(item);
          if(!tags.length && list.some(r=>r.kind==='tag')) tags=await fetchTags(id.bot,active,cache,budget);
          if(!tags.length && list.some(r=>r.kind==='tag'))unknownTags++;
          const canClassify = (!list.some(r=>r.kind==='persona') || !!(person.id || person.name)) &&
            (!list.some(r=>r.kind==='tag') || !!tags.length);
          if(canClassify)eligibleKeys.push(id.key);
          const folders=matches(item,list,tags);
          if(folders.length){assignments[id.key]=folders;matched++;}
        }
        const last=result.data[result.data.length-1];const id=identity(last);
        status(`Scanning metadata: ${read} chats · ${matched} matches · page ${pages}/${maxPages}`);
        if(result.data.length<25) break;
        if(!id || cursor===id.convo) {stopReason='cursor could not advance';break;}
        cursor=id.convo;
        if(daily && !newCount && oldCount) {stopReason='reached previously scanned conversations';break;}
        await sleep(450);
      }
      if(pages===maxPages)stopReason=`page limit (${maxPages})`;
      const result={assignments,cache,seen:[...seen],eligibleKeys,read,matched,unknownPersona,unknownTags,pages,stopReason,rules:currentRules,daily};
      if (daily) await apply(result);
      else {pending=result;status(`Preview ready: ${matched}/${read} chats matched. ${unknownPersona} without persona metadata, ${unknownTags} without tags. Open preview below before applying.`);renderPreview();}
    } catch(error) {status(`Smart Folder scan stopped: ${clean(error?.message||error)}`);}
    finally {if(run===active)run=null; updateButtons();}
  }
  async function apply(result=pending) {
    if(!result || !enabled()) return;
    await ensure();
    // Never touch user-authored manual folders. Automatic assignments live in their own store.
    const updated={...state.assignments};
    // Missing metadata is unknown, NOT evidence that an old assignment should be deleted.
    for(const key of result.eligibleKeys) delete updated[key];
    Object.assign(updated,result.assignments);
    const next=unpack({...state,assignments:updated,botTags:result.cache,
      known:[...new Set([...result.seen,...state.known])].slice(0,6000),lastScanAt:Date.now(),lastAppliedRules:result.rules});
    await storeSet(next);state=next;pending=null;
    status(`${result.matched} conversation matches applied. Manual folders were preserved. Scanned ${result.read} chats (${result.stopReason}).`);
    renderPreview();DS.scheduleRun?.({priority:'slow',source:'smart-chat-folder-applied'});
  }
  function renderPreview() {
    const box=document.querySelector('#ds-chat-smart-folders-preview');if(!box)return;
    box.replaceChildren();
    if(!pending)return;
    const summary=document.createElement('p');summary.textContent=`${pending.matched} matches in ${pending.read} chats. Only confirmed persona IDs/names and supplied bot tags count. ${pending.unknownPersona} lack persona metadata; ${pending.unknownTags} lack tag metadata. ${pending.stopReason}.`;box.append(summary);
    const pre=document.createElement('pre');pre.style.whiteSpace='pre-wrap';pre.style.maxHeight='150px';pre.style.overflow='auto';
    pre.textContent=Object.entries(pending.assignments).slice(0,12).map(([key,folders])=>`${key} → ${folders.join(', ')}`).join('\n') || 'No matches found. No folders will be changed.';box.append(pre);
    const applyButton=document.createElement('button');applyButton.type='button';applyButton.textContent='Apply previewed folders';applyButton.addEventListener('click',()=>apply().catch(e=>status(String(e?.message||e))));box.append(applyButton);
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Discard preview';cancel.addEventListener('click',()=>{pending=null;renderPreview();status('Preview discarded. No folders changed.');});box.append(cancel);
  }
  function updateButtons() {
    const begin=document.querySelector('#ds-chat-smart-scan');if(begin){begin.disabled=!!run;begin.textContent=run?'Scanning…':'Scan & preview';}
    const cancel=document.querySelector('#ds-chat-smart-cancel');if(cancel)cancel.disabled=!run;
  }
  function mount(toolbar) {
    if(!enabled()) {document.querySelector('#ds-chat-smart-folders-tools')?.remove();return;}
    if(!loaded) {ensure().catch(()=>{});}
    if(!toolbar || !toolbar.isConnected)return;
    let box=document.getElementById('ds-chat-smart-folders-tools');
    if(!box){
      box=document.createElement('div');box.id='ds-chat-smart-folders-tools';box.className='ds-chat-smart-folders-tools';
      const btn=document.createElement('button');btn.id='ds-chat-smart-scan';btn.type='button';btn.textContent='Scan & preview';btn.addEventListener('click',()=>scan().catch(e=>status(e.message)));
      const stop=document.createElement('button');stop.id='ds-chat-smart-cancel';stop.type='button';stop.textContent='Cancel scan';stop.addEventListener('click',()=>{if(run)run.cancelled=true;});
      const st=document.createElement('span');st.id='ds-chat-smart-folders-status';st.setAttribute('role','status');st.textContent='Smart Folders: metadata scan only, no chat messages.';
      const preview=document.createElement('div');preview.id='ds-chat-smart-folders-preview';
      box.append(btn,stop,st,preview);
    }
    if(box.parentElement!==toolbar)toolbar.append(box);
    updateButtons();
    if(!autoChecked && cfg().smartChatFolderDailyRefresh===true && loaded && state.lastAppliedRules && Date.now()-state.lastScanAt>=DAY_MS && !document.hidden){
      autoChecked=true;
      setTimeout(()=>{if(enabled() && !run && !document.hidden)scan({daily:true}).catch(e=>status(e.message));},5500);
    }
  }
  const smart = Object.freeze({ mount,folderNames:()=>cfg().enableChatSmartFolders ? [...new Set(Object.values(state.assignments).flat())] : [],foldersFor:key=>cfg().enableChatSmartFolders ? (state.assignments[key]||[]) : [],
    debug:{identity,persona,extractTags,rules,matches} });
  DS.chatSmartFolders=smart;
})();
}
