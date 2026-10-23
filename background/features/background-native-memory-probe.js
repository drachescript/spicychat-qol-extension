'use strict';
// Experimental, read-only, opt-in native Memory watcher. Privacy invariant:
// native Memory text NEVER leaves this background handler or enters export logs.
// Only aggregate change/quality counts return to the content script.
(() => {
  const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  const previous=new Map(),inFlight=new Set();
  const storageGet=key=>new Promise(resolve=>chrome.storage.local.get(key,result=>
    resolve(chrome.runtime.lastError?null:result?.[key]||null)));
  const storageSet=(key,value)=>new Promise(resolve=>chrome.storage.local.set({[key]:value},()=>
    resolve(!chrome.runtime.lastError)));
  function accountKey(token){
    try{
      const raw=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      const claims=JSON.parse(atob(raw.padEnd(Math.ceil(raw.length/4)*4,'=')));
      const subject=String(claims.user_id||claims.sub||claims.uid||'');
      return subject.length<256?subject:'';
    }catch{return '';}
  }

  const digest=async s=>{
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
    return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
  };
  const textOf=m=>{
    const parts=[m?.content,m?.text,m?.memory,m?.description];
    for(const item of parts){if(typeof item==='string')return item.slice(0,16000);if(typeof item?.text==='string')return item.text.slice(0,16000);}
    return '';
  };
  dsqRegisterBackgroundMessageHandler('DS_NATIVE_MEMORY_PROBE','context-keeper',(message,sender,respond)=>{
    const page=sender?.url||sender?.tab?.url||'';
    const match=/^https:\/\/(?:www\.)?spicychat\.ai\/chat\/([0-9a-f-]{36})\/([0-9a-f-]{36})(?:[/?#]|$)/i.exec(page);
    const conversationId=String(message?.conversationId||'').toLowerCase();
    const token=String(message?.authToken||'');
    if(!match||!UUID.test(conversationId)||match[2].toLowerCase()!==conversationId||
       !JWT.test(token)||token.length>12000){respond({ok:false,status:'invalid-chat-or-auth'});return false;}
    // Persist the baseline in extension storage so a sleeping MV3 background
    // worker or a second tab doesn't reset every comparison to "first read".
    const account=accountKey(token);
    const key=`${account||token}:${conversationId}`;
    if(inFlight.has(key)){respond({ok:false,status:'already-checking'});return false;}
    inFlight.add(key);
    (async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
      let response;
      try{
        const headers={Authorization:`Bearer ${token}`,Accept:'application/json, text/plain, */*',
          'x-app-id':'spicychat','x-platform':'WEB','x-platform-os':'DESKTOP'};
        if(typeof message.appVersion==='string'&&/^[\w.\-]{1,32}$/.test(message.appVersion))headers['x-app-version']=message.appVersion;
        response=await fetch(`https://prod.nd-api.com/conversations/${conversationId}/memories`,
          {method:'GET',headers,credentials:'include',cache:'no-store',signal:controller.signal});
      }finally{clearTimeout(timer);}
      if(response.status===401)return {ok:false,status:'auth-rejected',httpStatus:401};
      if(!response.ok)return {ok:false,status:'http-failed',httpStatus:response.status};
      const json=await response.json();
      const items=Array.isArray(json)?json:Array.isArray(json?.memories)?json.memories:
        Array.isArray(json?.data?.memories)?json.data.memories:Array.isArray(json?.data)?json.data:null;
      if(!items)return {ok:false,status:'unknown-response-shape'};
      if(items.length>5000)return {ok:false,status:'memory-list-too-large'};
      const map=new Map(),lengths=[],canonicalCounts=new Map();
      const weak={uncertain:0,ambiguousReference:0,unstructured:0,possibleConflicts:0};
      const candidates=[];
      for(const item of items){
        const id=String(item?.id||item?.memory_id||'');
        if(!id||id.length>150)continue;
        const text=textOf(item);
        const fp=await digest(id+'\n'+text+'\n'+String(item?.updated_at||item?.updatedAt||''));
        map.set(await digest(id),fp);lengths.push(text.length);
        if(text.trim()){
          const normalized=text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
          canonicalCounts.set(normalized,(canonicalCounts.get(normalized)||0)+1);
          // Heuristics only: these flags never rewrite, remove or publish Memory.
          if(/\b(?:maybe|perhaps|might|probably|possibly|seems?|i think|unsure|not sure)\b/i.test(normalized))weak.uncertain++;
          if(/^(?:he|she|they|it|this|that|him|her|his|their)\b/i.test(normalized))weak.ambiguousReference++;
          if(normalized.length>300 && !/[.!?;:\n]/.test(text))weak.unstructured++;
          if(candidates.length<300){
            const subject=normalized.slice(0,90).replace(/\b(?:not|never|no|isn't|wasn't|doesn't)\b/g,'').replace(/\s+/g,' ');
            if(subject.length>=22)candidates.push({subject,negative:/\b(?:not|never|no|isn't|wasn't|doesn't)\b/i.test(normalized)});
          }
        }
      }
      // Count possible polarity conflicts only in a bounded subset and only
      // when substantial text is shared. Never call these confirmed contradictions.
      for(let i=0;i<candidates.length;i++){
        const first=candidates[i];
        for(let j=i+1;j<candidates.length;j++){
          const second=candidates[j];
          if(first.negative!==second.negative && first.subject===second.subject){weak.possibleConflicts++;break;}
        }
      }
      const storeKey='dsNativeMemoryProbeBaselineV1:'+ (await digest(key)).slice(0,40);
      const stored=await storageGet(storeKey);
      const prior=previous.get(key) || (stored?.version===1 && Array.isArray(stored.pairs) && stored.pairs.length<=5000
        ? new Map(stored.pairs.filter(p=>Array.isArray(p)&&p.length===2&&p.every(v=>typeof v==='string'&&v.length<200))) : null);
      const added=prior?[...map.keys()].filter(id=>!prior.has(id)).length:0;
      const removed=prior?[...prior.keys()].filter(id=>!map.has(id)).length:0;
      const updated=prior?[...map.entries()].filter(([id,fp])=>prior.has(id)&&prior.get(id)!==fp).length:0;
      // Never persist raw Memory text, Memory IDs or bearer tokens.
      const persisted=await storageSet(storeKey,{version:1,pairs:[...map.entries()],checkedAt:Date.now()});
      if(!persisted)return {ok:false,status:'baseline-storage-error'};
      previous.set(key,map);
      if(previous.size>24)previous.delete(previous.keys().next().value);
      // No content, memory identifiers or hashes returned to page/Inspector.
      const changed=!!prior && !!(added+removed+updated);
      return {ok:true,changed,baseline:!prior,count:map.size,added,removed,updated,
        // Only perform quality checks when a *verified* change occurred.
        quality:changed?{empty: lengths.filter(n=>n===0).length,veryShort:lengths.filter(n=>n>0&&n<30).length,
          long:lengths.filter(n=>n>1500).length,
          exactDuplicateTexts:[...canonicalCounts.values()].reduce((n,count)=>n+Math.max(0,count-1),0),
          ...weak}:null};
    })().then(respond).catch(err=>respond({ok:false,status:err?.name==='AbortError'?'timeout':'request-error'}))
      .finally(()=>inFlight.delete(key));
    return true;
  });
})();
