// Optional reviewed transfer of approved Context Keeper facts to LOCAL Lorebook.
// No native writes or observers; runs only when the user opens review.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  'use strict';
  const DS=window.DragonScriptQoL;if(!DS)return;
  const FACTS='contextKeeperData',BOOK='dsQolChatLorebookDraftsV1',SKIP='dsQolContextLorebookReviewV1';
  const clean=(v,n=2000)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n);
  const norm=v=>clean(v).normalize('NFKC').toLowerCase();
  const get=keys=>new Promise((resolve,reject)=>chrome.storage.local.get(keys,x=>chrome.runtime.lastError?reject(Error(chrome.runtime.lastError.message)):resolve(x||{})));
  const set=value=>new Promise((resolve,reject)=>chrome.storage.local.set(value,()=>chrome.runtime.lastError?reject(Error(chrome.runtime.lastError.message)):resolve()));
  const scope=()=>DS.getCurrentChatScope?.()?.key||'';
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
  function possibleContradiction(before,after){
    if(!before||!after)return false;
    const a=norm(before),b=norm(after);
    const negative=t=>/\b(?:not|never|no|isn't|wasn't|doesn't)\b/.test(t);
    const strip=t=>t.replace(/\b(?:not|never|no|isn't|wasn't|doesn't)\b/g,'').replace(/\s+/g,' ').trim();
    return negative(a)!==negative(b)&&strip(a)===strip(b);
  }
  function suggest(fact,book,skipped){
    const text=clean(fact?.text),id=clean(fact?.id,200);
    if(!text||!id||fact.enabled===false||fact.needsReview||fact.supersededBy||skipped[id]===text)return null;
    const linked=book.find(e=>Array.isArray(e.sourceDetailIds)&&e.sourceDetailIds.includes(id));
    if(linked && (linked.sourceSnapshots?.[id]===text || norm(linked.content)===norm(text)))return null;
    if(book.some(e=>norm(e.content)===norm(text)))return null;
    const category=clean(fact.category||'Fact',22);
    const title=clean(`${category}: ${text}`,50);
    const collision=!linked && book.some(e=>norm(e.name)===norm(title));
    return {id,text,linked,collision,possibleConflict:!!linked&&possibleContradiction(linked.content,text),title:linked?.name||title,
      keywords:Array.isArray(linked?.keywords)?linked.keywords:[],fact};
  }
  function field(host,title,value,max,textarea=false){
    const label=el('label',title);label.style.display='block';label.style.margin='8px 0';
    const input=el(textarea?'textarea':'input');input.value=value||'';input.maxLength=max;
    Object.assign(input.style,{display:'block',width:'100%',boxSizing:'border-box',padding:'7px',background:'#101419',color:'white',border:'1px solid #666',borderRadius:'5px'});
    if(textarea)input.rows=4;label.append(input);host.append(label);return input;
  }
  function button(host,text,fn){const b=el('button',text);b.type='button';Object.assign(b.style,{padding:'7px',margin:'3px',border:'1px solid #666',borderRadius:'5px',background:'#303740',color:'#fff',cursor:'pointer'});b.addEventListener('click',fn);host.append(b);return b;}
  DS.openContextLorebookProposalReview=async function(){
    if(DS.state?.settings?.enableContextLorebookSuggestions!==true || DS.state?.settings?.enableChatLorebookManager!==true || DS.state?.settings?.enabled===false)return false;
    const key=scope();if(!/^conversation:[0-9a-f-]{36}$/i.test(key))return false;
    document.getElementById('ds-context-lorebook-review')?.remove();
    const mask=el('div');mask.id='ds-context-lorebook-review';Object.assign(mask.style,{position:'fixed',inset:0,zIndex:2147483000,background:'rgba(0,0,0,.8)',padding:'15px',display:'grid',placeItems:'center'});
    const panel=el('div');Object.assign(panel.style,{width:'min(740px,100%)',maxHeight:'88vh',overflow:'auto',background:'#1c2028',color:'white',padding:'16px',borderRadius:'10px',font:'14px system-ui'});
    panel.append(el('h2','Context Keeper → Local Lorebook review'),el('p','Only approved facts in this exact conversation are eligible. Review every change; no native Lorebook is edited.'));
    const status=el('p');status.setAttribute('role','status');panel.append(status);
    const body=el('div');button(panel,'Close',()=>mask.remove());button(panel,'Refresh suggestions',()=>refresh());panel.append(body);mask.append(panel);document.body.append(mask);
    let busy=false;
    async function refresh(){
      if(busy)return;
      if(scope()!==key){status.textContent='Conversation changed. Close and reopen.';body.replaceChildren();return;}
      const data=await get([FACTS,BOOK,SKIP]);const all=data[BOOK]||{};
      const book=Array.isArray(all[key])?all[key]:[];
      const facts=Array.isArray(data[FACTS]?.[key]?.details)?data[FACTS][key].details:[];
      const skipped=data[SKIP]?.[key]||{};
      const items=facts.slice(-350).map(f=>suggest(f,book,skipped)).filter(Boolean);
      body.replaceChildren();status.textContent=`${items.length} suggestions; ${book.length} local entries.`;
      for(const item of items.slice(0,100)){
        const box=el('div');Object.assign(box.style,{border:'1px solid #555',padding:'10px',margin:'8px 0',borderRadius:'7px'});
        box.append(el('strong',item.collision?'Potential name conflict (resolve in local editor)':item.possibleConflict?'Possible contradiction — review previous wording':item.linked?'Proposed update (compare original)':'Proposed new entry'));
        if(item.linked)box.append(el('p',`Existing text: ${clean(item.linked.content,350)}`));
        const name=field(box,'Name',item.title,50);
        const keywords=field(box,'Keywords (comma separated, 12 max; leave blank to keep inactive)',item.keywords.join(', '),600);
        const content=field(box,'Content',item.text,2000,true);
        const feedback=el('p');box.append(feedback);
        button(box,'Approve local change',async()=>{
          if(busy)return;busy=true;
          try{
            if(scope()!==key)throw Error('Conversation changed.');
            if(item.collision)throw Error('Resolve this name conflict in Chat Lorebook Manager first.');
            if(item.possibleConflict && !confirm('This proposal may contradict the previous version. Approve the edited wording anyway?'))return;
            const data=await get([FACTS,BOOK]);const fact=(data[FACTS]?.[key]?.details||[]).find(f=>f?.id===item.id);
            if(!fact||clean(fact.text)!==item.text||fact.enabled===false||fact.needsReview||fact.supersededBy)throw Error('Source fact changed or is no longer approved. Refresh first.');
            const all=data[BOOK]||{},entries=Array.isArray(all[key])?[...all[key]]:[];
            const alreadyLinked=entries.find(e=>Array.isArray(e.sourceDetailIds)&&e.sourceDetailIds.includes(item.id));
            if(!item.linked&&alreadyLinked)throw Error('Another tab already linked this fact. Refresh before approving.');
            const index=item.linked?entries.findIndex(e=>e.entryId===item.linked.entryId):-1;
            if(item.linked&&(index<0||entries[index].content!==item.linked.content))throw Error('Existing entry changed. Refresh first.');
            if(index<0&&entries.length>=200)throw Error('Local Lorebook is full (200). Export or remove entries first.');
            const text=clean(content.value),title=clean(name.value,50);
            if(!text||!title)throw Error('Name and content are required.');
            if(entries.some((e,i)=>i!==index&&norm(e.content)===norm(text)))throw Error('Duplicate local Lorebook content.');
            const keys=[...new Map(keywords.value.split(',').map(k=>clean(k,80)).filter(Boolean).map(k=>[norm(k),k])).values()].slice(0,12);
            const old=index>=0?entries[index]:null;
            const record={...old,entryId:old?.entryId||crypto.randomUUID(),name:title,content:text,keywords:keys,
              schema:1,chatId:key,source:'context-keeper',sourceDetailIds:[...new Set([...(old?.sourceDetailIds||[]),item.id])],
              sourceSnapshots:{...(old?.sourceSnapshots||{}),[item.id]:item.text},
              disabled:old?.disabled===true||keys.length===0,pinned:old?.pinned===true||fact.pinned===true,
              createdAt:old?.createdAt||Date.now(),updatedAt:Date.now()};
            if(scope()!==key)throw Error('Conversation changed.');
            if(index>=0)entries[index]=record;else entries.push(record);
            all[key]=entries;await set({[BOOK]:all});box.remove();status.textContent='Saved locally. Review the remaining entries.';
          }catch(e){feedback.textContent=String(e.message||e);}finally{busy=false;}
        });
        button(box,'Skip this version',async()=>{
          if(busy)return;busy=true;try{if(scope()!==key)throw Error('Conversation changed.');
            const data=await get([SKIP]);const all=data[SKIP]||{};all[key]??={};all[key][item.id]=item.text;
            await set({[SKIP]:all});box.remove();status.textContent='Skipped. Changed facts can be proposed again.';
          }catch(e){feedback.textContent=String(e.message||e);}finally{busy=false;}
        });
        body.append(box);
      }
      if(items.length>100)body.append(el('p','More pending: review a batch, then refresh.'));
    }
    await refresh().catch(e=>status.textContent=String(e?.message||e));return true;
  };
})();
