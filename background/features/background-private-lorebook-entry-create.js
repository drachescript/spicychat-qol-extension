'use strict';
// One-shot authenticated entry creation with server-side verification.
// No PUT/PATCH/DELETE. A timeout after POST is ambiguous and MUST NOT retry.
(() => {
  const TYPE='DS_PRIVATE_LOREBOOK_ENTRY_CREATE';
  const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  const active=new Set();
  const BASE='https://prod.nd-api.com';
  const settings=async()=>new Promise(resolve=>{
    const keys=['settings','dsSettingV1:enabled','dsSettingV1:enablePrivateLorebookBridge',
      'dsSettingV1:privateLorebookRequireReview','dsSettingV1:privateLorebookAllowAutoCreate',
      'dsSettingV1:privateLorebookAllowArchiveAutoSync','dsSettingV1:privateLorebookStorageMode',
      'dsSettingV1:privateLorebookSyncMode','dsSettingV1:privateLorebookArchiveId'];
    chrome.storage.local.get(keys,r=>{
      if(chrome.runtime.lastError){resolve(null);return;}
      const out={...(r.settings||{})};
      for(const k of keys.slice(1))if(r[k]!==undefined)out[k.slice('dsSettingV1:'.length)]=r[k];
      resolve(out);
    });
  });
  function parseJWT(value){
    if(typeof value!=='string'||value.length>12000||!JWT.test(value))return false;
    try{const body=value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return Number(JSON.parse(atob(body.padEnd(Math.ceil(body.length/4)*4,'='))).exp||0)*1000>Date.now()+30000;}catch{return false;}
  }
  const canon=s=>String(s||'').toLowerCase();
  function validate(message,sender){
    const page=String(sender?.url||sender?.tab?.url||'');
    const match=/^https:\/\/(?:www\.)?spicychat\.ai\/chat\/([0-9a-f-]{36})\/([0-9a-f-]{36})(?:[/?#]|$)/i.exec(page);
    const mode=String(message?.mode||'');
    const id=message?.scope||{}, entry=message?.entry||{};
    if(!sender?.tab?.id||!match||!UUID.test(match[1])||!UUID.test(match[2])||
      canon(id.botId)!==canon(match[1])||canon(id.conversationId)!==canon(match[2])||
      !UUID.test(message?.bookId)||typeof message?.accountId!=='string'||message.accountId.length>160||
      !['archive-manual','archive-auto','native-auto'].includes(mode)||!parseJWT(message.authToken)||
      typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>50||
      typeof entry.content!=='string'||!entry.content.trim()||entry.content.length>2000||
      !Array.isArray(entry.keywords)||entry.keywords.length>12||
      entry.keywords.some(x=>typeof x!=='string'||!x.trim()||x.length>80))return null;
    if(mode.startsWith('archive')){
      let data;try{data=JSON.parse(entry.content)}catch{return null;}
      if(!String(entry.name).startsWith('QoL Archive ')||
        !['dsq-lorebook-archive/v1','dsq-lorebook-archive/v2'].includes(data?.schema)||
        data.botId!==id.botId||data.conversationId!==id.conversationId||
        !String(data.detailId||'').trim()||data.detailId!==message.detailId||
        typeof data.content!=='string'||!data.content.trim()||data.content.length>2000)return null;
    }
    return {id,mode,entry,bookId:canon(message.bookId),accountId:message.accountId,token:message.authToken};
  }
  async function run(v,tabId){
    const opts=await settings();
    if(!opts||opts.enabled!==true||opts.enablePrivateLorebookBridge!==true)return {ok:false,status:'disabled'};
    if(v.mode==='archive-auto'&&!(opts.privateLorebookAllowArchiveAutoSync===true&&opts.privateLorebookSyncMode==='on-change'))return {ok:false,status:'auto-sync-not-approved'};
    if(v.mode.startsWith('archive')&&!['archive','hybrid'].includes(opts.privateLorebookStorageMode))return {ok:false,status:'archive-storage-disabled'};
    if(v.mode.startsWith('archive')&&canon(opts.privateLorebookArchiveId)!==v.bookId)return {ok:false,status:'archive-id-changed'};
    if(v.mode==='native-auto'&&(opts.privateLorebookRequireReview!==false||opts.privateLorebookAllowAutoCreate!==true))return {ok:false,status:'native-auto-not-approved'};
    const headers={'Authorization':'Bearer '+v.token,'Accept':'application/json, text/plain, */*',
      'Content-Type':'application/json','x-app-id':'spicychat','x-platform':'WEB','x-platform-os':'DESKTOP'};
    async function read(path){
      const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),10000);
      try{const res=await fetch(BASE+path,{method:'GET',headers,credentials:'include',cache:'no-store',signal:ctl.signal});
        if(!res.ok)throw Error('read-http-'+res.status);
        return await res.json();
      }finally{clearTimeout(timer);}
    }
    const user=await read('/v2/users');
    if(user?.user?.id!==v.accountId)return {ok:false,status:'account-changed'};
    const bot=await read(`/v2/characters/${v.id.botId}?include=rulebook`);
    if(canon(bot?.id)!==v.id.botId||bot?.creator_user_id!==v.accountId||!['private','hidden'].includes(bot?.visibility)||
       !Array.isArray(bot.lorebooks)||bot.lorebooks.length!==1||!UUID.test(bot.lorebooks[0]?.id))return {ok:false,status:'bot-ownership-or-attachment'};
    const attached=canon(bot.lorebooks[0].id);
    if(v.mode==='native-auto' ? v.bookId!==attached : v.bookId===attached)return {ok:false,status:'wrong-lorebook-target'};
    const book=await read(`/lorebooks/${v.bookId}?sortBy=priority&lastSortPriority=0`);
    if(canon(book?.id)!==v.bookId||book?.visibility!=='private'||book?.creator_user_id!==v.accountId)return {ok:false,status:'book-ownership-or-visibility'};
    if(v.mode.startsWith('archive')&&book.numAttachedCharacters!==0)return {ok:false,status:'archive-connected-to-bot'};
    const count=Number(book.num_entries);
    // Complete list mandatory for avoiding duplicate names after an uncertain prior POST.
    if(!Number.isSafeInteger(count)||count<0||count>=5000||!Array.isArray(book.entries)||book.entries.length<count)
      return {ok:false,status:'cannot-check-all-entries'};
    if(book.entries.some(x=>String(x.name||'').toLowerCase()===v.entry.name.toLowerCase()))
      return {ok:false,status:'possible-existing-entry'};
    // The user may have switched conversations while the three verification
    // requests were running. A stale tab must not write old conversation data.
    const latestTab=await new Promise(resolve=>chrome.tabs.get(tabId,tab=>resolve(chrome.runtime.lastError?null:tab||null)));
    const tabPath=latestTab?.url||'';
    const expected='/chat/'+v.id.botId+'/'+v.id.conversationId;
    if(!/^https:\/\/(?:www\.)?spicychat\.ai\//i.test(tabPath) ||
       ![expected,expected+'/'].includes(new URL(tabPath).pathname))return {ok:false,status:'chat-changed-before-write'};
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),16000);
    let result;
    try{
      const response=await fetch(`${BASE}/lorebooks/${v.bookId}/entries`,{method:'POST',headers,
        credentials:'include',cache:'no-store',body:JSON.stringify(v.entry),signal:ctl.signal});
      if(!response.ok)return {ok:false,status:'post-http',httpStatus:response.status,
        ambiguous:response.status>=500||response.status===429||response.status===408};
      result=await response.json();
    }catch {return {ok:false,status:'post-result-unknown',ambiguous:true};}
    finally {clearTimeout(timer);}
    if(!UUID.test(result?.id)||canon(result.lorebookId)!==v.bookId)
      return {ok:false,status:'post-response-unverified',ambiguous:true};
    try{
      const after=await read(`/lorebooks/${v.bookId}?sortBy=priority&lastSortPriority=0`);
      if(after?.creator_user_id!==v.accountId||after?.visibility!=='private'||
         (v.mode.startsWith('archive')&&after.numAttachedCharacters!==0))
        return {ok:false,status:'saved-but-ownership-recheck-failed',ambiguous:true};
      const stored=Array.isArray(after.entries)&&after.entries.find(e=>canon(e.id)===canon(result.id));
      if(!stored||stored.name!==v.entry.name||stored.content!==v.entry.content)
        return {ok:false,status:'saved-but-readback-unverified',ambiguous:true};
      return {ok:true,id:result.id,bookId:v.bookId,version:Number(result.version)||1,verified:true};
    }catch{return {ok:false,status:'saved-but-readback-failed',ambiguous:true};}
  }
  dsqRegisterBackgroundMessageHandler(TYPE,'private-lorebook-bridge',(message,sender,respond)=>{
    const v=validate(message,sender);
    if(!v){respond({ok:false,status:'blocked'});return false;}
    const key=`${v.accountId}:${v.id.botId}:${v.id.conversationId}:${v.bookId}`;
    if(active.has(key)){respond({ok:false,status:'already-running'});return false;}
    active.add(key);
    run(v,sender.tab.id).then(respond).catch(e=>respond({ok:false,status:String(e?.message||'verification-failed').slice(0,100)})).finally(()=>active.delete(key));
    return true;
  });
})();
