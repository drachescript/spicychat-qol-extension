// Independent opt-in local Lorebook keyword recall. No native Lorebook writes,
// no history/DOM scanning, and no messages are sent by this feature.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const KEY='dsQolChatLorebookDraftsV1',FACTS='contextKeeperData';
  let loadedScope='', revision=0, matches=[];
  const scope=()=>DS.getCurrentChatScope?.()?.key || '';
  const active=()=>DS.state?.settings?.enabled!==false && DS.state?.settings?.enableLocalLorebookRecall===true;
  const normal=s=>String(s||'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function build(entries,details) {
    const list=[];
    const currentFacts=new Map((Array.isArray(details)?details:[]).filter(f=>f?.id).map(f=>[f.id,f]));
    for(const record of Array.isArray(entries)?entries.slice(-200):[]){
      if(!record || record.disabled || !record.name || !record.content || !Array.isArray(record.keywords))continue;
      // Reviewed CK-linked entries become stale when their source is updated,
      // excluded or superseded. No old canon may be injected while awaiting
      // the next review; manual local entries remain independent.
      if(record.source==='context-keeper'||Array.isArray(record.sourceDetailIds)&&record.sourceDetailIds.length){
        const ids=Array.isArray(record.sourceDetailIds)?record.sourceDetailIds:[];
        if(!ids.length || !ids.every(id=>{
          const fact=currentFacts.get(id);
          return fact && fact.enabled!==false && !fact.needsReview && !fact.supersededBy &&
            typeof record.sourceSnapshots?.[id]==='string' &&
            String(fact.text||'').trim()===record.sourceSnapshots[id];
        }))continue;
      }
      const keywords=[];
      for(const value of record.keywords.slice(0,12)){
        const word=normal(value);
        if(!word || word.length>80)continue;
        try {keywords.push({word,re:new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}(?=$|[^\\p{L}\\p{N}])`,'u')});}catch{}
      }
      if(keywords.length)list.push({
        name:String(record.name).slice(0,50).replace(/[\r\n\[\]]/g,' '),
        content:String(record.content).slice(0,2000).replace(/[\[\]]/g,' ').replace(/\s+/g,' ').trim(),
        keywords,pinned:record.pinned===true,at:Number(record.updatedAt||record.createdAt)||0
      });
    }
    return list;
  }
  function load(){
    const id=scope();const version=++revision;
    loadedScope=''; matches=[];
    if(!id||!active())return;
    chrome.storage.local.get([KEY,FACTS],data=>{
      if(version!==revision || id!==scope() || !active() || chrome.runtime.lastError)return;
      matches=build(data?.[KEY]?.[id],data?.[FACTS]?.[id]?.details);loadedScope=id;
    });
  }
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local')return;
    // The storage keys hold data for many conversations. Editing another chat
    // must not wake this chat's recall engine or parse its full entry list.
    const chat=scope();
    const changedForChat=[KEY,FACTS].some(key=>changes[key] &&
      JSON.stringify(changes[key].oldValue?.[chat])!==JSON.stringify(changes[key].newValue?.[chat]));
    if(changedForChat){if(active())load();else{++revision;loadedScope='';matches=[];}}
    if(changes.settings||changes['dsSettingV1:enableLocalLorebookRecall']||changes['dsSettingV1:enabled'])queueMicrotask(load);
  });
  // React SPA route changes are caught without adding another MutationObserver.
  window.addEventListener('popstate',load);
  const ordered=items=>items.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.score-a.score||b.at-a.at);
  DS.getLocalLorebookSendCandidate=(draft='')=>{
    const s=DS.state?.settings||{};
    if(s.enabled===false || s.enableLocalLorebookRecall!==true || !DS.isSingleChatPage?.())return null;
    if(!scope() || loadedScope!==scope()){load();return null;} // first send after a route change fails closed
    let text=normal(draft);
    if(!text)return null;
    const recentCount=Math.max(0,Math.min(2,Number(s.localLorebookRecentMessages)||0));
    if(recentCount>0){
      // Only the already loaded LAST messages, never a full chat scan.
      // No recursion: matching is on native message text, not lorebook entries.
      const nodes=(DS.getLoadedMessageRoots?.()||[]).slice(-recentCount);
      for(const root of nodes){
        const nativeText=root?.querySelector?.('div.whitespace-pre-wrap,div[class*="break-words"]');
        if(nativeText){const chunk=normal((nativeText.textContent||'').slice(0,1800));if(chunk)text+=' '+chunk;}
      }
    }
    const selected=[];
    for(const entry of matches){
      let best=0;
      for(const keyword of entry.keywords)if(keyword.re.test(text))best=Math.max(best,keyword.word.length);
      if(best)selected.push({...entry,score:best});
    }
    if(!selected.length)return null;
    ordered(selected);
    const max=Math.max(200,Math.min(1400,Number(s.localLorebookRecallMaxChars)||900));
    const prefix='[OOC: Local lorebook facts for this specific conversation (reference only; preserve character knowledge and user agency): ';
    let parts=[],size=prefix.length+1;
    for(const entry of selected){
      if(parts.length>=4)break;
      const piece=`${entry.name}: ${entry.content}`;
      const next=size+piece.length+(parts.length?3:0);
      if(next>max)continue; // Never silently truncate a factual entry.
      parts.push(piece);size=next;
    }
    if(!parts.length)return null;
    return {directive:prefix+parts.join(' | ')+']',matched:parts.length};
  };
  load();
})();
