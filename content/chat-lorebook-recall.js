// Independent opt-in local Lorebook keyword recall. No native Lorebook writes,
// no history/DOM scanning, and no messages are sent by this feature.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const KEY='dsQolChatLorebookDraftsV1';
  let loadedScope='', revision=0, matches=[];
  const scope=()=>DS.getCurrentChatScope?.()?.key || '';
  const normal=s=>String(s||'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function build(entries) {
    const list=[];
    for(const record of Array.isArray(entries)?entries.slice(-200):[]){
      if(!record || record.disabled || !record.name || !record.content || !Array.isArray(record.keywords))continue;
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
    if(!id)return;
    chrome.storage.local.get(KEY,data=>{
      if(version!==revision || id!==scope() || chrome.runtime.lastError)return;
      matches=build(data?.[KEY]?.[id]);loadedScope=id;
    });
  }
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes[KEY])load();
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
