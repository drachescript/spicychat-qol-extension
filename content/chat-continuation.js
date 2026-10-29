// Chat Continuation / Transfer Assistant: explicit, read-only and review-first.
// No native messages, memories, Lorebooks or chat settings are ever written.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const SCHEMA = 'dsq-chat-continuation/v1';
  const MODAL = 'ds-qol-continuation-overlay';
  const FIELDS = [
    ['events', 'Important events'], ['relationships', 'Relationships'],
    ['characters', 'Characters and introductions'], ['locations', 'Places and world details'],
    ['unresolved', 'Unresolved story threads'], ['scene', 'Current scene'],
    ['memories', 'Approved memories and local lore'], ['instructions', 'Continuation notes']
  ];
  const LIMITS = { short: 1200, balanced: 3200, detailed: 7200 };
  const MAX_PAGES = 160, MAX_CANDIDATES = 100, MAX_FILE_BYTES = 1024 * 1024;
  const pause = ms => new Promise(done => setTimeout(done, ms));
  const current = () => { const m = location.pathname.match(/^\/chat\/([^/?#]+)\/([^/?#]+)/i); return m && UUID.test(m[1]) && UUID.test(m[2]) ? { bot: m[1].toLowerCase(), chat: m[2].toLowerCase(), path: location.pathname } : null; };
  const enabled = () => !!DS.state?.settings?.enabled && DS.state.settings.enableChatContinuationAssistant === true && !!current();
  const clean = (value, max = 2000) => String(value ?? '').replace(/[\u200b\ufeff]/g, '').replace(/\s+/g, ' ').trim().slice(0,max);
  const make = (tag, cls = '', label = '') => { const n = document.createElement(tag); if (cls) n.className = cls; if (label) n.textContent = label; return n; };
  const button = (label, fn) => { const b = make('button', '', label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const localGet = keys => new Promise((resolve, reject) => chrome.storage.local.get(keys, v => chrome.runtime.lastError ? reject(Error(chrome.runtime.lastError.message)) : resolve(v || {})));
  const localSet = value => new Promise((resolve, reject) => chrome.storage.local.set(value, () => chrome.runtime.lastError ? reject(Error(chrome.runtime.lastError.message)) : resolve()));
  const fields = () => Object.fromEntries(FIELDS.map(([id]) => [id, '']));
  const empty = chat => ({ schema:SCHEMA, source:{ botId:chat?.bot||'', conversationId:chat?.chat||'', collectedAt:'' }, kind:'group', mode:'full', detail:'balanced', scanned:0, complete:false, fields:fields(), candidates:[], selected:[], contextSources:[], exclusions:[] });
  const fingerprint = value => clean(value,5000).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'').slice(0,180);
  function safePackage(value) {
    if (!value || value.schema !== SCHEMA || typeof value.fields !== 'object' || !value.fields) throw Error('Not a supported QoL continuation JSON file.');
    const output = empty();
    output.source = { botId: clean(value.source?.botId,64), conversationId:clean(value.source?.conversationId,64), collectedAt:clean(value.source?.collectedAt,50) };
    output.kind = ['solo','group','other'].includes(value.kind) ? value.kind : 'group';
    output.mode = ['full','current','memories','custom'].includes(value.mode) ? value.mode : 'full';
    output.detail = Object.hasOwn(LIMITS,value.detail) ? value.detail : 'balanced';
    for (const [id] of FIELDS) output.fields[id] = String(value.fields[id] ?? '').slice(0,12000);
    output.scanned = Math.max(0,Math.min(100000,Number(value.scanned)||0)); output.complete=!!value.complete;
    output.candidates = (Array.isArray(value.candidates)?value.candidates:[]).slice(0,MAX_CANDIDATES).map(v=>({ text:clean(v.text,540), category:FIELDS.some(([id])=>id===v.category)?v.category:'events', role:clean(v.role,30), messageId:clean(v.messageId,40) })).filter(v=>v.text);
    output.selected = (Array.isArray(value.selected)?value.selected:[]).map(v=>Number(v)).filter(n=>Number.isInteger(n)&&n>=0&&n<output.candidates.length).slice(0,MAX_CANDIDATES);
    output.contextSources = (Array.isArray(value.contextSources)?value.contextSources:[]).map(x=>clean(x,60)).slice(0,15);
    output.exclusions = (Array.isArray(value.exclusions)?value.exclusions:[]).map(x=>clean(x,400)).slice(0,50);
    return output;
  }
  function category(text) {
    if (/\b(we are|right now|currently|tonight|today|just arrived|standing|sitting)\b/i.test(text)) return 'scene';
    if (/\b(promised|promise|need to|still need|must find|looking for|haven't|should|will return|plan to)\b/i.test(text)) return 'unresolved';
    if (/\b(love|trust|hate|friend|partner|together|married|sister|brother|family|dating)\b/i.test(text)) return 'relationships';
    if (/\b(forest|house|castle|room|city|village|hospital|cave|mountain|street|school)\b/i.test(text)) return 'locations';
    if (/\b(name is|met |introduced|called |leader|guardian|stranger|captain)\b/i.test(text)) return 'characters';
    return 'events';
  }
  function score(text) {
    let s=0; if (/\b(discovered|realized|revealed|confessed|agreed|decided|escaped|saved|betrayed|died|learned|found|lost|promise|secret|remember|never|always|must|plan|family|friend|relationship|married|current|now|next)\b/i.test(text)) s+=3;
    if (/\b(because|after|before|first time|since then|however)\b/i.test(text)) s++;
    if (text.length>=55&&text.length<=350) s++;
    return s;
  }
  let active = null;
  function updateStatus(ctx, message) { if (active===ctx && ctx.status) ctx.status.textContent=message; }
  function guard(ctx) { if (active!==ctx||ctx.cancel||!enabled()||!current()||current().chat!==ctx.route.chat||document.hidden) throw Error('Stopped: chat changed, tab hidden, or Cancel pressed.'); }
  function saveInputs(ctx) {
    for (const [id] of FIELDS) ctx.data.fields[id] = ctx.inputs[id]?.value.slice(0,12000) || '';
    ctx.data.kind=ctx.kind.value; ctx.data.mode=ctx.mode.value; ctx.data.detail=ctx.detail.value;
  }
  function assembled(ctx) {
    saveInputs(ctx);
    const p=ctx.data, budget=LIMITS[p.detail];
    const heading=p.kind==='group'?'Continue this story in a new group chat':'Continue this story in a new conversation';
    const out=[heading,'[OOC: User-reviewed continuity brief. Treat this as background context, not as messages that occurred in this new chat. Do not speak for the user or invent missing history.]'];
    if(p.kind==='group')out.push('New participants may join from this point onward. Preserve established relationships, but do not assume newcomers witnessed earlier events or know private information.');
    const allowed=p.mode==='current'?new Set(['scene','characters','relationships','unresolved','instructions']):p.mode==='memories'?new Set(['memories','characters','relationships','instructions']):null;
    for(const [id,label] of FIELDS) { const text=p.fields[id].trim();if(text&&(!allowed||allowed.has(id)))out.push(`${label}:\n${text}`); }
    const selected=[...new Set(p.selected)].map(i=>p.candidates[i]).filter(Boolean);
    if(p.mode!=='memories'&&selected.length)out.push('Selected source excerpts (quoted for reference; review their meaning and chronology):');
    const prefix=out.join('\n\n');
    let remaining=Math.max(0,budget-prefix.length-140);
    let included=0;const parts=[prefix];
    for(const c of selected){const t=`- ${c.role||'Message'}: ${c.text}\n`;if(t.length>remaining)break;parts.push(t);remaining-=t.length;included++;}
    const result=parts.join('\n');return { text:result,estimate:Math.ceil(result.length/4),limit:Math.ceil(budget/4),shown:included,selected:selected.length,overBudget:prefix.length>budget };
  }
  function preview(ctx) {
    if(active!==ctx)return;
    const v=assembled(ctx);ctx.preview.value=v.text;
    ctx.tokens.textContent=`~${v.estimate} tokens (rough estimate) · ${ctx.data.detail} target ~${v.limit} · ${v.shown}/${v.selected} excerpts included${v.overBudget?' · Your edited fields exceed the target':''}`;
  }
  function drawCandidates(ctx) {
    ctx.suggestions.replaceChildren();
    const list=ctx.data.candidates;
    if(!list.length){ctx.suggestions.append(make('p','ds-continuation-muted','History excerpts appear here after a manual scan. No facts are automatically approved.'));return;}
    const selected=new Set(ctx.data.selected);
    for(let i=0;i<list.length;i++){
      const c=list[i],label=make('label','ds-continuation-suggestion');
      const check=make('input');check.type='checkbox';check.checked=selected.has(i);
      check.addEventListener('change',()=>{const set=new Set(ctx.data.selected);check.checked?set.add(i):set.delete(i);ctx.data.selected=[...set].sort((a,b)=>a-b);preview(ctx);});
      const span=make('span','',`${c.category} · ${c.role||'Message'}: ${c.text}`);label.append(check,span);ctx.suggestions.append(label);
    }
  }
  async function readHistory(ctx) {
    const reader=DS.fetchChatHistoryPageShared||DS.fetchChatHistoryPage;
    if(typeof reader!=='function')throw Error('Authenticated history reader unavailable.');
    ctx.cancel=false;ctx.busy=true;ctx.scan.disabled=true;ctx.stop.disabled=false;
    ctx.data.candidates=[];ctx.data.selected=[];ctx.data.scanned=0;ctx.data.complete=false;
    const seenCursors=new Set(),seenSnippets=new Set();let cursor='',pageSize=200,done=false,seen=0;
    const found=[];
    try{
      for(let page=0;page<MAX_PAGES;page++){
        guard(ctx);
        if(seenCursors.has(cursor))throw Error('Repeated cursor; scan stopped to protect the chat API.');
        seenCursors.add(cursor);
        let response;
        try{response=await reader(ctx.route.bot,ctx.route.chat,{limit:pageSize,lastId:cursor});}
        catch(error){ if(pageSize>50&&[400,404,413,422].includes(Number(error?.httpStatus||0))){pageSize=pageSize===200?100:50;seenCursors.delete(cursor);page--;continue;} throw error; }
        guard(ctx);
        const rows=response?.data?.messages;
        if(!Array.isArray(rows))throw Error('History response was not a message page.');
        if(!rows.length){done=true;break;}
        for(const row of rows){
          seen++;
          const text=clean(row?.content||row?.text||row?.message,1200);
          if(text.length<24)continue;
          const samples=text.match(/[^.!?\n]{25,400}[.!?]?/g)?.slice(0,5)||[text];
          for(const sample of samples){const line=clean(sample,480),key=fingerprint(line);if(key.length<25||seenSnippets.has(key)||score(line)<3)continue;
            seenSnippets.add(key);
            const c={text:line,category:category(line),role:/^(user|human)$/i.test(row.role||'')?'You':'Bot',messageId:String(row.id||'')};
            // Keep both recent and earlier context: never retain complete raw history.
            if(found.length<MAX_CANDIDATES)found.push(c);
            else if((seen%7===0) && (found.length>20)){found.splice(20+(seen%(found.length-20)),1,c);}
          }
        }
        ctx.data.scanned=seen;updateStatus(ctx,`Reading history · ${seen} messages · ${page+1} API page(s) · ${found.length} review candidates`);
        const oldest=rows.at(-1);if(Object.hasOwn(oldest,'prev_id')&&oldest.prev_id==null){done=true;break;}
        const next=String(oldest?.id||'');if(!UUID.test(next)||next===cursor)throw Error('History cursor missing or repeated.');
        cursor=next;
        await pause(130); // deliberate manual scan, never tight-loop requests
      }
      ctx.data.complete=done;ctx.data.candidates=found;ctx.data.selected=[];ctx.data.source.collectedAt=new Date().toISOString();
      drawCandidates(ctx);preview(ctx);
      updateStatus(ctx,`${done?'History scanned':'Scan limit reached'} · ${seen} messages, ${found.length} excerpts ready to review. Nothing transferred.`);
    }catch(error){ctx.data.candidates=found;ctx.data.selected=[];drawCandidates(ctx);preview(ctx);updateStatus(ctx,`${error.message||error} · ${seen} messages read; partial excerpts kept for review.`);}
    finally{ctx.busy=false;ctx.scan.disabled=false;ctx.stop.disabled=true;}
  }
  async function addOptionalSources(ctx) {
    saveInputs(ctx);
    const keys=['contextKeeperData','dsQolChatLorebookDraftsV1'];
    const stored=await localGet(keys);
    if(active!==ctx)return;
    const existing=new Set(ctx.data.fields.memories.split('\n').map(fingerprint));
    const additions=[];
    if(ctx.includeKeeper.checked){
      const entry=stored.contextKeeperData?.[ctx.route.chat];
      const details=Array.isArray(entry?.details)?entry.details:[];
      for(const f of details){if(f?.enabled===false||f?.needsReview||f?.supersededBy)continue;const value=clean(f?.text,750);if(value&&!existing.has(fingerprint(value))){additions.push(`Context Keeper · ${clean(f.category,30)}: ${value}`);existing.add(fingerprint(value));}}
      ctx.data.contextSources.push('Context Keeper approved details');
    }
    if(ctx.includeLore.checked){
      const scope=DS.getCurrentChatScope?.()?.key||ctx.route.chat;
      const entries=stored.dsQolChatLorebookDraftsV1?.[scope]||[];
      for(const e of Array.isArray(entries)?entries:[]){if(e?.disabled)continue;const value=clean(e?.content,1000);if(value&&!existing.has(fingerprint(value))){additions.push(`Local Lorebook · ${clean(e?.name,55)}: ${value}`);existing.add(fingerprint(value));}}
      ctx.data.contextSources.push('Local Lorebook enabled drafts');
    }
    const free=Math.max(0,12000-ctx.inputs.memories.value.length);
    ctx.inputs.memories.value+=(ctx.inputs.memories.value?'\n':'')+additions.join('\n').slice(0,free);
    ctx.data.contextSources=[...new Set(ctx.data.contextSources)];
    preview(ctx);updateStatus(ctx,`${additions.length} nonduplicate, enabled saved entries added for review. Existing source data unchanged.`);
  }
  function downloadPayload(ctx, name, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = make('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function exportMemoryNotes(ctx) {
    saveInputs(ctx);
    const lines = ctx.data.fields.memories.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (!lines.length) return updateStatus(ctx, 'Add reviewed memory lines before exporting a Memory Manager JSON.');
    if (!window.confirm(`Export ${lines.length} reviewed memory lines? Importing into a different chat later may add these to its native memories. Review the target chat and duplicate checks before doing so.`)) return;
    if (lines.length > 200 || lines.some(text => text.length > 1200))
      return updateStatus(ctx, 'Too many or overly long memory lines. Maximum 200 lines of 1,200 characters each; edit before export.');
    const memories = lines.map((text,order)=>({text,order,pinned:false}));
    downloadPayload(ctx, `spicychat-transfer-memories-${ctx.route.chat.slice(0,8)}.json`, {
      format:'spicychat-qol-memories',version:1,exportedAt:new Date().toISOString(),
      source:{ conversationId:ctx.route.chat,botId:ctx.route.bot },count:memories.length,memories
    });
    updateStatus(ctx,`${memories.length} reviewed memories exported. Import in target chat's Memory Manager only after checking the preview.`);
  }
  function exportLorebookDrafts(ctx) {
    saveInputs(ctx);
    const path = (ctx.targetChat?.value||'').trim();
    let url; try { url = new URL(path); } catch {}
    const found = url?.hostname === 'spicychat.ai' && url.pathname.match(/^\/chat\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/?$/i);
    if (!found || !UUID.test(found[1]) || !UUID.test(found[2])) return updateStatus(ctx,'Paste a full SpicyChat target chat URL (both IDs) before exporting Lorebook drafts.');
    const id=found[2].toLowerCase();
    const entries=FIELDS.filter(([key])=>key!=='instructions').flatMap(([key,label])=>{
      const content=ctx.data.fields[key].trim();if(!content)return[];
      const chunks=content.match(/[\s\S]{1,2000}/g)||[];
      return chunks.map((piece,i)=>({name:`Transfer ${label}`.slice(0,45)+(chunks.length>1?` ${i+1}`:''),content:piece,keywords:[],disabled:true,source:'chat-continuation-transfer',schema:1,chatId:id}));
    });
    if(!entries.length)return updateStatus(ctx,'Enter reviewed story context before exporting Lorebook drafts.');
    if(entries.length>200)return updateStatus(ctx,'Too many Lorebook entries for the 200-entry local limit. Shorten your brief.');
    downloadPayload(ctx,`spicychat-transfer-lorebook-${id.slice(0,8)}.json`,{schema:'dsq-chat-lorebook-drafts/v1',chatId:id,entries});
    updateStatus(ctx,`${entries.length} inactive local Lorebook drafts exported for the target chat. Import through QoL's local chat Lorebook tools; review keywords and enable entries manually.`);
  }
  function file(ctx, ext) {
    saveInputs(ctx);const data=ext==='json'?JSON.stringify(safePackage(ctx.data),null,2):assembled(ctx).text;
    const blob=new Blob([data],{type:ext==='json'?'application/json;charset=utf-8':'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=make('a');a.href=url;a.download=`spicychat-continuation-${ctx.route.chat.slice(0,8)}.${ext}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
    updateStatus(ctx,`${ext.toUpperCase()} export requested. Verify the saved file before relying on it.`);
  }
  function close() { if(!active)return;active.cancel=true;active.dialog?.remove();active=null; }
  async function open() {
    if(!enabled())return;
    close();const route=current();if(!route)return;
    const ctx={route,data:empty(route),cancel:false,busy:false,inputs:{}};active=ctx;
    const overlay=make('div','ds-continuation-overlay');overlay.id=MODAL;
    const panel=make('section','ds-continuation-panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Chat Continuation Assistant');ctx.dialog=overlay;
    const head=make('header','ds-continuation-head');head.append(make('h2','','Chat Continuation / Transfer'),button('×',close));panel.append(head);
    panel.append(make('p','ds-continuation-muted','Review-first transfer: scan old history, edit context, then copy a brief or export Memory Manager JSON and inactive local Lorebook drafts for another chat. The source chat is read-only. No external AI summary is generated; nothing is automatically imported.'));
    const settings=make('div','ds-continuation-controls');
    const select=(label,values,chosen,cb)=>{const l=make('label');l.append(make('span','',label));const s=make('select');for(const [v,t] of values){const o=make('option','',t);o.value=v;s.append(o);}s.value=chosen;s.addEventListener('change',cb);l.append(s);settings.append(l);return s;};
    ctx.kind=select('Target',[['group','Group chat'],['solo','New solo chat'],['other','Different bot']],ctx.data.kind,()=>preview(ctx));
    ctx.mode=select('Transfer mode',[['full','Full continuity'],['current','Current situation'],['memories','Selected memories'],['custom','Custom']],ctx.data.mode,()=>preview(ctx));
    ctx.detail=select('Length',[['short','Short'],['balanced','Balanced'],['detailed','Detailed']],ctx.data.detail,()=>preview(ctx));panel.append(settings);
    const scanActions=make('div','ds-continuation-actions');ctx.scan=button('Scan source history',()=>void readHistory(ctx));ctx.stop=button('Stop scan',()=>{ctx.cancel=true;ctx.stop.disabled=true;updateStatus(ctx,'Stopping after the current API request…');});ctx.stop.disabled=true;
    scanActions.append(ctx.scan,ctx.stop);panel.append(scanActions);
    ctx.status=make('p','ds-continuation-status','Nothing scanned yet. Start a manual history scan, or write the brief yourself.');panel.append(ctx.status);
    const toggles=make('div','ds-continuation-checks');
    const check=(name)=>{const l=make('label');const c=make('input');c.type='checkbox';l.append(c,make('span','',name));toggles.append(l);return c;};
    ctx.includeKeeper=check('Use approved Context Keeper details');ctx.includeLore=check('Use enabled local Lorebook drafts');
    toggles.append(button('Load selected saved details',()=>void addOptionalSources(ctx).catch(e=>updateStatus(ctx,`Saved details unavailable: ${e.message||e}`))));panel.append(toggles);
    panel.append(make('h3','','Review or write the continuity brief'));
    const edit=make('div','ds-continuation-fields');for(const [id,label] of FIELDS){const l=make('label');l.append(make('span','',label));const area=make('textarea');area.rows=id==='scene'?3:2;area.maxLength=12000;area.placeholder=id==='scene'?'Where everyone is, what they are doing, and what happens next…':'Add verified facts or your own summary. Nothing is filled in automatically.';area.addEventListener('input',()=>preview(ctx));ctx.inputs[id]=area;l.append(area);edit.append(l);}panel.append(edit);
    const exp=make('details');exp.append(make('summary','','History suggestions (must select; not an AI summary)'));ctx.suggestions=make('div','ds-continuation-candidates');exp.append(ctx.suggestions);panel.append(exp);
    panel.append(make('h3','','Transfer preview'));ctx.tokens=make('p','ds-continuation-muted');panel.append(ctx.tokens);ctx.preview=make('textarea','ds-continuation-preview');ctx.preview.rows=9;ctx.preview.readOnly=true;panel.append(ctx.preview);
    const actions=make('div','ds-continuation-actions');actions.append(button('Copy reviewed brief',async()=>{try{const result=assembled(ctx);if(result.overBudget&&!window.confirm('Your edited brief exceeds the selected size. Copy the longer brief anyway?'))return;await navigator.clipboard.writeText(result.text);updateStatus(ctx,'Reviewed brief copied. Paste manually into the new chat when ready.');}catch{ctx.preview.focus();ctx.preview.select();updateStatus(ctx,'Clipboard unavailable. Preview selected; copy it manually.');}}),button('Export JSON',()=>file(ctx,'json')),button('Export TXT',()=>file(ctx,'txt')),button('Import JSON',()=>ctx.importer.click()));
    ctx.importer=make('input');ctx.importer.type='file';ctx.importer.accept='.json,application/json';ctx.importer.hidden=true;
    ctx.importer.addEventListener('change',async()=>{const f=ctx.importer.files?.[0];ctx.importer.value='';if(!f)return;try{if(f.size>MAX_FILE_BYTES)throw Error('File exceeds 1 MB limit.');const p=safePackage(JSON.parse(await f.text()));if(active!==ctx)return;ctx.data=p;for(const [id] of FIELDS)ctx.inputs[id].value=p.fields[id];ctx.mode.value=p.mode;ctx.kind.value=p.kind;ctx.detail.value=p.detail;drawCandidates(ctx);preview(ctx);updateStatus(ctx,'Transfer package imported for review. Nothing sent or changed in either chat.');}catch(e){updateStatus(ctx,`Import rejected: ${e.message||e}`);}});
    const memoryFile=make('input');memoryFile.type='file';memoryFile.accept='.json,application/json';memoryFile.hidden=true;
    memoryFile.addEventListener('change',async()=>{
      const f=memoryFile.files?.[0];memoryFile.value='';if(!f)return;
      try{
        if(f.size>MAX_FILE_BYTES)throw Error('File exceeds 1 MB limit.');
        const imported=JSON.parse(await f.text());
        if(!['spicychat-qol-memories','spicychat-qol-memory-vault'].includes(imported?.format))throw Error('Use a native Memory export or Memory Vault JSON from QoL.');
        const values=imported?.format==='spicychat-qol-memories'?imported.memories:imported.entries;
        if(!Array.isArray(values))throw Error('The file has no memory entries.');
        const have=new Set(ctx.inputs.memories.value.split('\n').map(fingerprint));
        let added=0,room=Math.max(0,12000-ctx.inputs.memories.value.length);
        for(const row of values.slice(0,500)){
          if(imported.format==='spicychat-qol-memory-vault' && row.status==='saved-pending-delete')continue;
          const value=clean(typeof row==='string'?row:row?.text,1000);
          if(!value||have.has(fingerprint(value)))continue;
          const line=`Native Memory (imported, review): ${value}\n`;
          if(line.length>room)break;
          ctx.inputs.memories.value+=(ctx.inputs.memories.value?'\n':'')+line;
          room-=line.length+1;have.add(fingerprint(value));added++;
        }
        ctx.data.contextSources.push('Manually imported Memory JSON');ctx.data.contextSources=[...new Set(ctx.data.contextSources)];
        preview(ctx);updateStatus(ctx,`${added} nonduplicate Memory entries loaded for manual review. Nothing written to SpicyChat.`);
      }catch(e){updateStatus(ctx,`Memory import rejected: ${e.message||e}`);}
    });
    const target=make('label','ds-continuation-target');target.append(make('span','','Target chat URL (for local Lorebook draft export only)'));
    ctx.targetChat=make('input');ctx.targetChat.type='url';ctx.targetChat.placeholder='https://spicychat.ai/chat/<bot-id>/<conversation-id>';target.append(ctx.targetChat);panel.append(target);
    actions.append(button('Export Memory JSON',()=>exportMemoryNotes(ctx)),button('Export target Lorebook drafts',()=>exportLorebookDrafts(ctx)));
    actions.append(button('Import Memory JSON',()=>memoryFile.click()),memoryFile,ctx.importer);panel.append(actions);
    panel.append(make('p','ds-continuation-muted','Native Clone Conversation duplicates a conversation via SpicyChat’s own action. QoL cannot confirm a supported way to insert historic messages into a new group chat. This assistant only prepares a user-reviewed context brief. Native memories are not read automatically; add them manually in Approved memories if available.'));
    overlay.append(panel);overlay.addEventListener('click',e=>{if(e.target===overlay)close();});document.body.append(overlay);drawCandidates(ctx);preview(ctx);
  }
  DS.applyChatContinuationAssistant=()=>{
    if(!enabled()){document.querySelectorAll('.ds-chat-continuation-launcher').forEach(n=>n.remove());close();if(DS.state) DS.state.chatContinuationWasActive=false;return;}
    if(DS.state) DS.state.chatContinuationWasActive=true;
    if(active&&current()?.chat!==active.route.chat)close();
    const host=document.querySelector('.ds-chat-title-actions-host')||document.querySelector('a[aria-label="chatbot-profile"]')?.parentElement;
    if(!host||host.querySelector('.ds-chat-continuation-launcher'))return;
    const b=button('Transfer',()=>void open());b.className='ds-chat-continuation-launcher';b.title='Prepare reviewed continuity for another chat (Experimental)';host.append(b);
  };
  DS.openChatContinuationAssistant=()=>void open();
})();
