(() => {
  "use strict";
  const DS=window.DragonScriptQoL;if(!DS)return;
  const BTN_ID="ds-saved-lists-open", MODAL_ID="ds-saved-lists-overlay";
  const clean=v=>String(v||"").replace(/\s+/g," ").trim();
  function safeUrl(value,fallback=""){try{const u=new URL(String(value||""),location.origin);return /^https?:$/i.test(u.protocol)?u.href:fallback;}catch{return fallback;}}
  function org(id){return DS.state.botOrganization?.meta?.[id]||{};}
  function entries(kind){const source=kind==="later"?DS.state.laterBots:DS.state.favoriteBots;const ids=Array.isArray(source?.ids)?source.ids:[];return ids.map((id,index)=>{const m=source?.meta?.[id]||{};const o=org(id);return{id,name:m.name||o.name||id,creator:m.creator||o.creator||"",image:safeUrl(m.image||o.image||""),description:m.description||"",profileUrl:safeUrl(m.profileUrl||o.profileUrl,`${location.origin}/chatbot/${id}`),chatUrl:safeUrl(m.chatUrl||o.chatUrl,`${location.origin}/chat/${id}`),savedAt:Number(m.savedAt||0),folders:Array.isArray(o.collections)?o.collections:[],tags:Array.isArray(o.tags)?o.tags:[],note:o.note||"",inLater:!!DS.state.laterBotIdSet?.has(id),inFavorite:!!DS.state.favoriteBotIdSet?.has(id),index};});}
  async function saveLater(next){DS.state.laterBots=next;DS.state.laterBotIdSet=new Set(next.ids||[]);await DS.saveLaterBots?.(next);}
  async function toggleLater(entry){const src=DS.state.laterBots||{ids:[],meta:{}};const next={ids:[...(src.ids||[])],meta:{...(src.meta||{})}};if(next.ids.includes(entry.id)){next.ids=next.ids.filter(id=>id!==entry.id);delete next.meta[entry.id];}else{next.ids.unshift(entry.id);next.meta[entry.id]={id:entry.id,name:entry.name,creator:entry.creator,image:entry.image,profileUrl:entry.profileUrl,chatUrl:entry.chatUrl,savedAt:Date.now()};}await saveLater(next);DS.setQuickStatus?.(next.ids.includes(entry.id)?"Added to Later.":"Removed from Later.");}
  function open(){
    document.getElementById(MODAL_ID)?.remove();const modal=document.createElement("div");modal.id=MODAL_ID;modal.style.cssText="position:fixed;inset:0;z-index:1000000;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:14px";
    DS.setSafeMarkup?.(modal, `<div style="width:min(1050px,98vw);height:min(780px,94vh);display:flex;flex-direction:column;background:#17181b;color:#f5f5f5;border:1px solid #444;border-radius:14px;padding:16px;font:14px system-ui"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><h2 style="margin:0">Saved lists</h2><small style="opacity:.72">QoL-local Favorites history + Later. Nothing here creates a new SpicyChat account list.</small></div><button data-close>×</button></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0"><button data-tab="favorite">Favorites</button><button data-tab="later">Later</button><input data-search type="search" placeholder="Search name, creator, note, folder…" style="flex:1;min-width:210px"><select data-sort><option value="newest">Newest</option><option value="name">Name A-Z</option><option value="creator">Creator A-Z</option><option value="folder">Folder</option></select></div><div data-summary style="opacity:.75;margin-bottom:8px"></div><div data-list style="overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px"></div></div>`);
    document.documentElement.appendChild(modal);let tab=DS.isFavoriteBotsPage?.()?"favorite":"later";const search=modal.querySelector("[data-search]"),sort=modal.querySelector("[data-sort]"),list=modal.querySelector("[data-list]"),summary=modal.querySelector("[data-summary]");
    const render=()=>{
      let rows=entries(tab);
      const q=clean(search.value).toLowerCase();
      if(q)rows=rows.filter(e=>[e.name,e.creator,e.note,...e.folders,...e.tags].join(" ").toLowerCase().includes(q));
      if(sort.value==="name")rows.sort((a,b)=>a.name.localeCompare(b.name));
      else if(sort.value==="creator")rows.sort((a,b)=>a.creator.localeCompare(b.creator)||a.name.localeCompare(b.name));
      else if(sort.value==="folder")rows.sort((a,b)=>(a.folders[0]||"~").localeCompare(b.folders[0]||"~")||a.name.localeCompare(b.name));
      else rows.sort((a,b)=>b.savedAt-a.savedAt||b.index-a.index);
      summary.textContent=`${rows.length} ${tab==="later"?"Later bot":"favorite-history entr"}${rows.length===1?(tab==="later"?"":"y"):(tab==="later"?"s":"ies")}`;
      const cards=rows.map(e=>{
        const card=document.createElement("div"); card.style.cssText="border:1px solid #333;border-radius:10px;padding:10px;display:grid;grid-template-columns:52px 1fr;gap:9px";
        const media=document.createElement("div");
        if(e.image){const img=document.createElement("img");img.src=e.image;img.alt="";img.style.cssText="width:52px;height:52px;border-radius:8px;object-fit:cover";media.appendChild(img);}
        const body=document.createElement("div"); const name=document.createElement("strong");name.textContent=e.name;body.appendChild(name);
        if(e.creator){const creator=document.createElement("div");creator.style.opacity=".72";creator.textContent=e.creator;body.appendChild(creator);}
        if(e.folders.length){const folders=document.createElement("div");folders.style.fontSize="12px";folders.textContent=`📁 ${e.folders.join(", ")}`;body.appendChild(folders);}
        if(e.note){const note=document.createElement("div");note.style.cssText="font-size:12px;margin-top:4px";note.textContent=e.note;body.appendChild(note);}
        const actions=document.createElement("div");actions.style.cssText="display:flex;gap:7px;flex-wrap:wrap;margin-top:7px";
        const profile=document.createElement("a");profile.href=e.profileUrl;profile.target="_self";profile.rel="noopener";profile.textContent="Profile";
        const chat=document.createElement("a");chat.href=e.chatUrl;chat.target="_self";chat.rel="noopener";chat.textContent="Chat";
        const later=document.createElement("button");later.type="button";later.textContent=e.inLater?"Remove Later":"Add Later";later.addEventListener("click",async()=>{await toggleLater(e);render();});
        actions.append(profile,chat,later);body.appendChild(actions);card.append(media,body);return card;
      });
      list.replaceChildren(...cards);
    };
    modal.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();});search.oninput=render;sort.onchange=render;modal.querySelector("[data-close]").onclick=()=>modal.remove();modal.onclick=e=>{if(e.target===modal)modal.remove();};render();search.focus();
  }
  function cleanup(){document.getElementById(BTN_ID)?.remove();document.getElementById(MODAL_ID)?.remove();}
  DS.applySavedListsOverlay=function(){const s=DS.state.settings||{};if(!s.enabled||!s.enableSavedListsOverlay)return cleanup();if(!DS.isFavoriteBotsPage?.()&&!/^\/recommended-bots\/?$/i.test(location.pathname))return cleanup();if(document.getElementById(BTN_ID))return;const h=[...document.querySelectorAll("h1,h2,h3")].find(el=>/favorites|recommend/i.test(clean(el.textContent)));if(!h?.parentElement)return;const b=document.createElement("button");b.id=BTN_ID;b.type="button";b.textContent="Saved lists";b.style.cssText="margin-left:8px;border:1px solid rgba(148,163,184,.35);border-radius:7px;background:transparent;color:inherit;padding:6px 9px;cursor:pointer;font:600 12px system-ui";b.onclick=e=>{e.preventDefault();e.stopPropagation();open();};h.insertAdjacentElement("afterend",b);};
  DS.removeSavedListsOverlay=cleanup;
})();
