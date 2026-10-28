// Optional Favorites → Later recovery. QoL's Favorite History is never removed.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const LAUNCHER = 'ds-favorites-recovery-open';
  const DIALOG = 'ds-favorites-recovery-dialog';
  const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  let job = null;
  const el = (tag, content = '', klass = '') => { const n = document.createElement(tag); if (content) n.textContent = content; if (klass) n.className = klass; return n; };
  const btn = (content, callback) => { const n = el('button', content); n.type = 'button'; n.addEventListener('click', callback); return n; };
  const clean = text => String(text || '').trim().slice(0, 250);
  const onPage = () => DS.state?.settings?.enabled && DS.state?.settings?.enableFavoritesRecovery === true && DS.isFavoriteBotsPage?.();

  function entries() {
    const history = DS.state?.favoriteBots || {};
    const known = new Map();
    for (const value of history.ids || []) {
      const id = clean(value).toLowerCase(); if (!UUID.test(id)) continue;
      known.set(id, { id, current: false, source: 'Remembered favorite', meta: history.meta?.[id] || {}, card: null });
    }
    for (const { card, anchor } of DS.collectCards?.() || []) {
      if (!card?.isConnected || !card.querySelector('[data-testid="CharacterCardOverlayActions-Favorite"]')) continue;
      const id = clean(DS.botIdFromHref?.(anchor?.href || '') || DS.chatIdFromHref?.(anchor?.href || '')).toLowerCase();
      if (!UUID.test(id)) continue;
      const old = known.get(id);
      const base = DS.makeBotMeta?.({ id, card, anchor }) || {};
      known.set(id, {
        id, current: true, source: 'Loaded favorite', card,
        meta: { ...(old?.meta || {}), ...base,
          id, name: clean(base.name || DS.getCardTitle?.(card) || old?.meta?.name || id),
          creator: clean(base.creator || old?.meta?.creator || ''),
          profileUrl: `https://spicychat.ai/chatbot/${id}`,
          image: clean(base.image || old?.meta?.image || '') }
      });
    }
    return [...known.values()];
  }

  function show() {
    if (!onPage()) return;
    document.getElementById(DIALOG)?.remove();
    const backdrop = el('div');backdrop.id = DIALOG;
    backdrop.style.cssText='position:fixed;inset:0;z-index:2147483005;background:rgba(0,0,0,.84);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;color:#e5e7eb';
    const panel=el('section');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Favorites recovery');
    panel.style.cssText='background:#191b23;border:1px solid #505665;border-radius:12px;padding:16px;width:min(740px,100%);max-height:90vh;overflow:auto;font:13px system-ui;box-sizing:border-box';
    const title=el('h2','Favorites → Later · Recovery');title.style.cssText='font-size:17px;margin:0 0 8px';
    const note=el('p','Includes remembered favorites even if SpicyChat removed them. Current means loaded on THIS page, not the whole native Favorites list. Never deletes Favorite History.');note.style.cssText='opacity:.85;line-height:1.5';
    const status=el('p','Choose bots below. Nothing changes until you start an action.');status.setAttribute('role','status');
    const summary=el('p');summary.style.opacity='.72';
    const input=el('input');input.type='search';input.placeholder='Search saved favorites';input.style.cssText='padding:8px;background:#252936;color:inherit;border:1px solid #555;border-radius:6px;min-width:160px;flex:1';
    const filter=el('select');filter.style.cssText='background:#252936;color:inherit;border:1px solid #555;padding:8px;border-radius:6px';
    for (const [value,label] of [['all','All saved'],['current','Currently loaded'],['history','Remembered only'],['later','Already in Later']]) { const o=el('option',label);o.value=value;filter.append(o); }
    const controls=el('div');controls.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center';controls.append(input,filter);
    const list=el('div');list.style.cssText='max-height:42vh;overflow:auto;display:grid;gap:4px;margin:10px 0';
    const actions=el('div');actions.style.cssText='display:flex;gap:7px;flex-wrap:wrap;margin:12px 0';
    const data=entries(),selected=new Set();let limit=100,busy=false,cancelled=false;
    const laterIds=new Set(DS.state?.laterBots?.ids || []);
    const eligible=()=>data.filter(row=>{
      const q=input.value.trim().toLowerCase();const m=row.meta||{};
      return (!q || `${m.name||''} ${m.creator||''} ${row.id}`.toLowerCase().includes(q)) &&
        (filter.value==='all'||filter.value==='current'&&row.current||filter.value==='history'&&!row.current||filter.value==='later'&&laterIds.has(row.id));
    });
    const styled=n=>{n.style.cssText='padding:7px 10px;background:#2a3040;color:inherit;border:1px solid #656b7b;border-radius:6px;cursor:pointer';return n;};
    function render(){
      list.replaceChildren();const shown=eligible(),rows=shown.slice(0,limit);
      for(const row of rows){
        const label=el('label');label.style.cssText='display:flex;gap:8px;align-items:center;padding:7px;background:#232632;border-radius:5px';
        const check=el('input');check.type='checkbox';check.checked=selected.has(row.id);check.disabled=busy;check.addEventListener('change',()=>check.checked?selected.add(row.id):selected.delete(row.id));
        const value=el('span',`${row.meta.name||row.id} · ${row.current?'Loaded favorite':'Favorite History'}${laterIds.has(row.id)?' · in Later':''}`);value.style.cssText='min-width:0;overflow-wrap:anywhere';label.append(check,value);list.append(label);
      }
      if(shown.length>rows.length)list.append(styled(btn(`Show 100 more (${shown.length-rows.length} remaining)`,()=>{limit+=100;render();})));
      summary.textContent=`${selected.size} selected · ${shown.length} filtered · ${data.filter(x=>x.current).length} loaded favorites · ${data.filter(x=>!x.current).length} remembered only`;
    }
    input.addEventListener('input',()=>{limit=100;render();});filter.addEventListener('change',()=>{limit=100;render();});
    const select=styled(btn('Select all filtered',()=>{if(busy)return;eligible().forEach(row=>selected.add(row.id));render();}));
    const clear=styled(btn('Clear',()=>{if(busy)return;selected.clear();render();}));
    const stop=styled(btn('Stop',()=>{cancelled=true;}));stop.disabled=true;
    const close=styled(btn('Close',()=>{if(busy){cancelled=true;return;}backdrop.remove();}));
    const selectedRows=()=>data.filter(row=>selected.has(row.id));
    async function copyToLater(rows){
      const existing=DS.state?.laterBots||{ids:[],meta:{}};
      const merged={ ids:[...(existing.ids||[])], meta:{...(existing.meta||{})} };
      const ids=new Set(merged.ids);let added=0;
      for(const row of rows){
        if(!ids.has(row.id)){ids.add(row.id);merged.ids.push(row.id);added++;}
        const prior=merged.meta[row.id]||{},m=row.meta||{};
        merged.meta[row.id]={...m,...prior,id:row.id,name:prior.name||m.name||row.id,creator:prior.creator||m.creator||'',
          image:prior.image||m.image||'',chatUrl:prior.chatUrl||m.chatUrl||`https://spicychat.ai/chat/${row.id}`,
          profileUrl:prior.profileUrl||m.profileUrl||`https://spicychat.ai/chatbot/${row.id}`,
          savedAt:prior.savedAt||m.savedAt||Date.now(),
          recoveredFromFavoriteHistory:prior.recoveredFromFavoriteHistory===true||!row.current};
      }
      await DS.saveLaterBots(merged);
      const saved=await DS.storageGet?.([DS.LATER_BOTS_KEY]);
      const verified=new Set(saved?.[DS.LATER_BOTS_KEY]?.ids||[]);
      if(rows.some(row=>!verified.has(row.id)))throw Error('Later storage verification failed. No native unfavorite actions were attempted.');
      for(const row of rows)laterIds.add(row.id);
      return added;
    }
    async function run(move){
      if(busy)return;const rows=selectedRows();if(!rows.length){status.textContent='Select at least one bot.';return;}
      const loaded=rows.filter(row=>row.current);
      if(move && !loaded.length){status.textContent='No currently loaded favorites selected. Use Copy to Later for saved history.';return;}
      if(move && !window.confirm(`Save ${rows.length} selected bots to Later, then attempt to unfavorite up to ${Math.min(loaded.length,100)} currently loaded bots? QoL will not remove missing/old history entries.`))return;
      if(!move && !window.confirm(`Copy ${rows.length} selected bots to Later? Native Favorites will stay unchanged.`))return;
      busy=true;cancelled=false;stop.disabled=false;try{
        status.textContent='Saving Later list first…';const added=await copyToLater(rows);
        if(!move){status.textContent=`Verified Later save: ${rows.length} protected (${added} newly added). Native favorites unchanged.`;return;}
        let confirmed=0,failed=0,processed=0;
        for(const row of loaded.slice(0,100)){
          if(cancelled || !onPage())break;
          processed++;status.textContent=`Later saved · unfavoriting ${processed}/${Math.min(loaded.length,100)} · ${confirmed} UI-removed · ${failed} unverified`;
          const native=row.card?.querySelector('button[aria-label="unfavorite"]');
          if(!native || !native.isConnected || native.disabled){failed++;continue;}
          native.click();
          let verified=false;
          for(let i=0;i<12;i++){
            await new Promise(resolve=>setTimeout(resolve,250));
            if(!row.card?.isConnected || row.card.querySelector('button[aria-label="favorite"]')){verified=true;break;}
          }
          if(verified)confirmed++;else failed++;
          await new Promise(resolve=>setTimeout(resolve,200));
        }
        status.textContent=`Later protected ${rows.length} (${added} new). Native unfavorite UI: ${confirmed} removed, ${failed} unverified${cancelled?' · stopped':''}${loaded.length>100?' · limited to 100 per run':''}. Your Favorite History was preserved.`;
      }catch(e){status.textContent=`Stopped: ${String(e?.message||e)}. Native favorites were not changed unless the native UI changed after earlier clicks.`;}
      finally{busy=false;stop.disabled=true;render();}
    }
    const copy=styled(btn('Copy selected → Later',()=>run(false)));
    const move=styled(btn('Move selected loaded → Later',()=>run(true)));
    const exportButton=styled(btn('Export selected JSON',()=>{
      const rows=selectedRows();if(!rows.length){status.textContent='Select at least one bot.';return;}
      const payload={format:'dsq-favorite-history-recovery',version:1,exportedAt:new Date().toISOString(),bots:rows.map(x=>({id:x.id,wasLoaded:x.current,...x.meta}))};
      DS.downloadTextFile?.(JSON.stringify(payload,null,2),`favorites-recovery-${Date.now()}.json`,'application/json;charset=utf-8',{requestPermission:true});
    }));
    actions.append(styled(select),styled(clear),copy,move,exportButton,stop,close);
    panel.append(title,note,controls,summary,list,actions,status);backdrop.append(panel);document.body.append(backdrop);
    render();
  }

  DS.applyFavoritesRecovery = function applyFavoritesRecovery(){
    const old=document.getElementById(LAUNCHER);
    if(!onPage()) { old?.remove();document.getElementById(DIALOG)?.remove();return; }
    const heading=[...document.querySelectorAll('h1,h2,h3')].find(n=>/^(favorites|favorite bots)$/i.test(clean(n.textContent)));
    if(!heading?.parentElement){old?.remove();return;}
    if(old?.isConnected)return;
    const button=btn('Favorites → Later',show);button.id=LAUNCHER;button.title='Copy or move saved favorites to QoL Later; includes remembered bots no longer in SpicyChat favorites';
    button.style.cssText='margin:8px 0;padding:7px 11px;border:1px solid #746a87;border-radius:7px;background:#292536;color:inherit;cursor:pointer;font:600 12px system-ui';
    heading.insertAdjacentElement('afterend',button);
  };
})();
