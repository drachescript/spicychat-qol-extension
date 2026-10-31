// Private Lorebook Bridge authenticated requests: browser-local, opt-in, and fail-closed.
// Reuses the same Firebase/browser token sources as QoL's card-token helper.
// Never persists or logs bearer tokens; only approved Archive setup transfers
// the short-lived session through the existing MAIN-world bridge.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const HOST = 'https://prod.nd-api.com';
  const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const READ_REQUEST='ds-qol-private-lorebook-read-request-v1';
  const READ_RESPONSE='ds-qol-private-lorebook-read-response-v1';
  const WRITE_REQUEST='ds-qol-private-archive-write-request-v1';
  const WRITE_RESPONSE='ds-qol-private-archive-write-response-v1';
  const ARCHIVE_AUTH_REQUEST='ds-qol-private-archive-auth-request-v1';
  const ARCHIVE_AUTH_RESPONSE='ds-qol-private-archive-auth-response-v1';
  const ENTRY_AUTH_REQUEST='ds-qol-private-entry-auth-request-v1';
  const ENTRY_AUTH_RESPONSE='ds-qol-private-entry-auth-response-v1';
  const MAX_AUTH_WAIT_MS=45000;
  let cache = null;
  function validToken(value) {
    if (typeof value !== 'string' || value.length > 12000 || !JWT.test(value)) return false;
    try {
      const body=value.split('.')[1];const padded=body.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(body.length/4)*4,'=');
      const expiry=Number(JSON.parse(atob(padded))?.exp||0)*1000;
      return expiry > Date.now()+30000;
    } catch {return false;}
  }
  function findToken(obj, depth=0) {
    if(depth>8||!obj)return '';
    if(typeof obj==='string')return validToken(obj)?obj:'';
    if(typeof obj!=='object')return '';
    // Prefer Firebase's current access token, not an arbitrary stale JWT.
    for(const key of ['accessToken','stsTokenManager','_tokenResponse','idToken','token']){
      if(key in obj){const result=findToken(obj[key],depth+1);if(result)return result;}
    }
    for(const val of Object.values(obj)){const result=findToken(val,depth+1);if(result)return result;}
    return '';
  }
  function storageToken(store){
    try {
      for(let i=0;i<store.length;i++){
        const key=store.key(i);if(!key)continue;
        const value=store.getItem(key)||'';
        if(validToken(value))return value;
        if((value[0]==='{'||value[0]==='[') && value.length<1500000){
          try{const result=findToken(JSON.parse(value));if(result)return result;}catch{}
        }
      }
    }catch{}
    return '';
  }
  async function firebaseToken(){
    if(!globalThis.indexedDB)return '';
    // Do not create an empty Firebase database when the user isn't signed in.
    if(typeof indexedDB.databases==='function'){
      try{const names=await indexedDB.databases();if(!names.some(x=>x.name==='firebaseLocalStorageDb'))return '';}catch{}
    }
    const db=await new Promise(resolve=>{
      let settled=false;const finish=x=>{if(!settled){settled=true;resolve(x);}};
      const timer=setTimeout(()=>finish(null),1600);
      try{const r=indexedDB.open('firebaseLocalStorageDb');
        r.onsuccess=()=>{clearTimeout(timer);if(settled){try{r.result.close();}catch{}}else finish(r.result);};
        r.onerror=r.onblocked=()=>{clearTimeout(timer);finish(null);};
      }catch{clearTimeout(timer);finish(null);}
    });
    if(!db)return '';
    try{
      const name=db.objectStoreNames.contains('firebaseLocalStorage')?'firebaseLocalStorage':[...db.objectStoreNames].find(x=>/firebase/i.test(x));
      if(!name)return '';
      const entries=await new Promise(resolve=>{
        try{const tx=db.transaction(name,'readonly'),req=tx.objectStore(name).getAll();
          req.onsuccess=()=>resolve(Array.isArray(req.result)?req.result:[]);
          req.onerror=()=>resolve([]);
        }catch{resolve([]);}
      });
      for(const item of entries){const token=findToken(item);if(token)return token;}
    }finally{try{db.close();}catch{}}
    return '';
  }
  async function availableToken(){
    if(cache&&validToken(cache.token)&&Date.now()-cache.at<20000)return cache.token;
    const token=storageToken(localStorage)||storageToken(sessionStorage)||await firebaseToken();
    if(token)cache={token,at:Date.now()};
    return token;
  }
  function mainAuthReady(){
    return document.documentElement?.getAttribute('data-ds-card-token-main-auth')==='1' &&
      document.documentElement?.getAttribute('data-ds-card-token-main-active')==='1';
  }
  function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
  function mainRead(path){
    return new Promise((resolve,reject)=>{
      const requestId='dspl-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
      let settled=false;
      const finish=value=>{
        if(settled)return;settled=true;clearTimeout(timer);
        window.removeEventListener(READ_RESPONSE,onResponse);
        resolve(value);
      };
      const onResponse=event=>{
        if(event?.detail?.requestId!==requestId)return;
        finish(event.detail);
      };
      const timer=setTimeout(()=>finish({ok:false,status:'timeout'}),17000);
      window.addEventListener(READ_RESPONSE,onResponse);
      try{window.dispatchEvent(new CustomEvent(READ_REQUEST,{detail:{requestId,path}}));}
      catch(error){clearTimeout(timer);window.removeEventListener(READ_RESPONSE,onResponse);reject(error);}
    });
  }
  // SpicyChat holds its currently used bearer in its native request flow.
  // The document-start bridge captures it, even when it is not stored in
  // localStorage/IndexedDB. A one-shot, user-initiated handoff supplies the
  // background-only Archive writer without storing the token persistently.
  async function capturedSetupToken(path){
    const params=new URLSearchParams(location.search);
    let setupToken=params.get('dsQolArchiveSetup')||params.get('dsQolLorebookClone')||'';
          if (!setupToken && /\/entries$/i.test(path)) {
            try {
              const cloned=JSON.parse(sessionStorage.getItem('dsQolPendingPrivateLorebookCloneV1')||'null');
              const imported=JSON.parse(sessionStorage.getItem('dsQolPendingLorebookImportV1')||'null');
              const id=path.match(/^\/lorebooks\/([0-9a-f-]{36})\/entries$/i)?.[1];
              const rec=imported?.approved===true && imported.targetId?.toLowerCase()===id?.toLowerCase()?imported:cloned;
              if (rec?.targetId?.toLowerCase()===id?.toLowerCase() &&
                  location.pathname.toLowerCase()===`/lorebook/edit/${id.toLowerCase()}/entries`) setupToken=rec.token||'';
            } catch {}
          }
    if(!UUID.test(setupToken) || !(['/save-image','/lorebooks'].includes(path)||/^\/lorebooks\/[0-9a-f-]{36}\/entries$/i.test(path)))return '';
    if(!mainAuthReady())return '';
    return new Promise(resolve=>{
      const requestId='dspl-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
      let settled=false;
      const finish=value=>{
        if(settled)return;settled=true;clearTimeout(timer);
        window.removeEventListener(ARCHIVE_AUTH_RESPONSE,onResponse);
        resolve(value);
      };
      const onResponse=event=>{
        if(event?.detail?.requestId!==requestId)return;
        const token=event.detail.token;
        finish(validToken(token)?token:'');
      };
      const timer=setTimeout(()=>finish(''),1100);
      window.addEventListener(ARCHIVE_AUTH_RESPONSE,onResponse);
      try{window.dispatchEvent(new CustomEvent(ARCHIVE_AUTH_REQUEST,{detail:{requestId,setupToken,path}}));}
      catch{finish('');}
    });
  }
  function mainWrite(path,payload){
    return new Promise(resolve=>{
      const requestId='dspl-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
      let settled=false;
      const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);
        window.removeEventListener(WRITE_RESPONSE,onResponse);resolve(result);};
      const onResponse=event=>{if(event?.detail?.requestId===requestId)finish(event.detail);};
      const timer=setTimeout(()=>finish({ok:false,status:'timeout'}),18000);
      window.addEventListener(WRITE_RESPONSE,onResponse);
      try{window.dispatchEvent(new CustomEvent(WRITE_REQUEST,{detail:{requestId,path,payload}}));}
      catch{finish({ok:false,status:'dispatch-error'});}
    });
  }
  function allowed(path, method){
    if(typeof path!=='string'||path.length>600||!path.startsWith('/')||path.startsWith('//')||/[#\\]/.test(path))return false;
    if(method==='GET')return path==='/v2/users'||path==='/lorebooks'||
      /^\/lorebooks\/[0-9a-f-]{36}(?:\?sortBy=priority&lastSortPriority=0)?$/i.test(path)||
      /^\/v2\/characters\/[0-9a-f-]{36}\?include=rulebook$/i.test(path);
    if(method==='POST')return path==='/save-image'||path==='/lorebooks'||/^\/lorebooks\/[0-9a-f-]{36}\/entries$/i.test(path);
    return false;
  }
  async function request(path,method='GET',payload){
    if(!allowed(path,method))throw new Error('Blocked unexpected private Lorebook API route.');
    const start=Date.now();
    // Native SPA auth often becomes usable after the Lorebook form appears.
    // Wait for an actual usable token, never guess, and never retry a write.
    let token='';
    while(Date.now()-start<MAX_AUTH_WAIT_MS){
      if(window.__DSQ_TAB_GATE__?.paused)throw new Error('QoL was disabled while checking authentication. No changes made.');
      // The background worker has explicit prod.nd-api.com host permission.
      // Do not retry a failed site XHR: an ambiguous write might already exist.
      // Instead, make exactly one background-origin POST for this user action.
      if(method==='POST' && (path==='/save-image'||path==='/lorebooks'||/^\/lorebooks\/[0-9a-f-]{36}\/entries$/i.test(path))){
        // The session SpicyChat used is the source of truth. Browser storage
        // may be empty or contain a still-valid token for a different login.
        token=cache&&validToken(cache.token)&&Date.now()-cache.at<20000?cache.token:(mainAuthReady()?await capturedSetupToken(path):'');
        if(token&&validToken(token))cache={token,at:Date.now()};
        if(!token)token=await availableToken();
        if(token){
          const params=new URLSearchParams(location.search);
          let setupToken=params.get('dsQolArchiveSetup')||params.get('dsQolLorebookClone')||'';
          if (!setupToken && /\/entries$/i.test(path)) {
            try {
              const cloned=JSON.parse(sessionStorage.getItem('dsQolPendingPrivateLorebookCloneV1')||'null');
              const imported=JSON.parse(sessionStorage.getItem('dsQolPendingLorebookImportV1')||'null');
              const id=path.match(/^\/lorebooks\/([0-9a-f-]{36})\/entries$/i)?.[1];
              const rec=imported?.approved===true && imported.targetId?.toLowerCase()===id?.toLowerCase()?imported:cloned;
              if (rec?.targetId?.toLowerCase()===id?.toLowerCase() &&
                  location.pathname.toLowerCase()===`/lorebook/edit/${id.toLowerCase()}/entries`) setupToken=rec.token||'';
            } catch {}
          }
          // A lost extension-worker callback must never freeze a Lorebook
          // import indefinitely. The worker may still finish an in-flight
          // write, so an expired response is UNKNOWN, never safe to retry.
          const result=await new Promise(resolve=>{
            let done=false;
            const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};
            const timer=setTimeout(()=>finish({ok:false,status:'background-response-timeout',ambiguous:true}),45000);
            try {chrome.runtime.sendMessage({
              type:'DS_PRIVATE_ARCHIVE_SETUP_WRITE',method,path,payload,setupToken,
              authToken:token,appVersion:document.querySelector('meta[name="app-version"]')?.content||''
            },response=>finish(chrome.runtime.lastError?{ok:false,status:'background-message-failed',ambiguous:true}:response||{ok:false,status:'no-response',ambiguous:true}));}
            catch{finish({ok:false,status:'background-message-failed',ambiguous:true});}
          });
          if(result?.ok)return result.data;
          if(result?.httpStatus===401){cache=null;throw Error('SpicyChat authentication rejected the Archive request (HTTP 401). No retry attempted.');}
          throw Error('SpicyChat '+(path==='/save-image'?'cover-upload authorization':(/\/entries$/i.test(path)?'entry creation':'Lorebook creation'))+
            ' failed via extension background ('+(result?.status||'unknown')+
            (result?.httpStatus?' HTTP '+result.httpStatus:'')+'). No automatic retry.');
        }
      }
      if(method==='GET' && mainAuthReady()){
        const result=await mainRead(path);
        if(result?.ok)return result.data;
        if(result?.httpStatus===401)throw new Error('SpicyChat authentication was rejected (HTTP 401). No Lorebook created.');
        if(result?.status==='http')throw new Error('SpicyChat request failed (HTTP '+result.httpStatus+').');
        if(result?.status==='timeout'||result?.status==='network-failure')throw new Error('Authenticated SpicyChat verification failed ('+result.status+').');
      }
      token=await availableToken();
      if(token)break;
      try{window.DSCardTokenBridgeLoader?.ensure?.();}catch{}
      await wait(700);
    }
    if(!token)throw new Error(mainAuthReady()
      ? 'SpicyChat is signed in, but QoL could not transfer the captured session to Archive setup. No write was sent.'
      : 'SpicyChat login authentication was not captured on this page. No write was sent.');
    if(method==='POST')throw new Error('Private Lorebook write was not sent. No authenticated extension session was available.');
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12500);
    try{
      const headers={Accept:'application/json, text/plain, */*',Authorization:'Bearer '+token,
        'x-app-id':'spicychat','x-platform':'WEB','x-platform-os':'DESKTOP'};
      const version=document.querySelector('meta[name="app-version"]')?.content;
      if(version&&version.length<80)headers['x-app-version']=version;
      if(payload!==undefined)headers['Content-Type']='application/json';
      const response=await fetch(HOST+path,{method,credentials:'include',cache:'no-store',headers,signal:ctl.signal,
        ...(payload!==undefined?{body:JSON.stringify(payload)}:{})});
      if(response.status===401){cache=null;throw new Error('SpicyChat authentication was rejected (HTTP 401). No automatic retries or writes were performed.');}
      if(!response.ok)throw new Error('SpicyChat request failed (HTTP '+response.status+').');
      return await response.json();
    }finally{clearTimeout(timer);}
  }
  function capturedEntryToken(s) {
    if(!mainAuthReady()||!s?.botId||!s?.conversationId)return Promise.resolve('');
    const route=location.pathname.match(/^\/chat\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/?$/i);
    if(!route||route[1].toLowerCase()!==s.botId||route[2].toLowerCase()!==s.conversationId)return Promise.resolve('');
    return new Promise(resolve=>{
      const requestId='dspl-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
      let settled=false;
      const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);window.removeEventListener(ENTRY_AUTH_RESPONSE,onResponse);resolve(value);};
      const onResponse=event=>{
        const d=event?.detail||{};
        if(d.requestId===requestId)finish(d.botId===s.botId&&d.conversationId===s.conversationId&&validToken(d.token)?d.token:'');
      };
      const timer=setTimeout(()=>finish(''),1200);
      window.addEventListener(ENTRY_AUTH_RESPONSE,onResponse);
      try{window.dispatchEvent(new CustomEvent(ENTRY_AUTH_REQUEST,{detail:{requestId,botId:s.botId,conversationId:s.conversationId}}));}
      catch{finish('');}
    });
  }
  async function prepareEntryCreate(s) {
    // Capture only for this persisted conversation; the backend validates
    // account and private attachment again. Nothing is saved or logged.
    let token=mainAuthReady()?await capturedEntryToken(s):'';
    if(!token){try{window.DSCardTokenBridgeLoader?.ensure?.();}catch{}
      token=await availableToken();}
    if(!validToken(token)) throw new Error('A safe entry-write session is unavailable. Use the reviewed native editor handoff; no write was attempted.');
    return Object.freeze({token,at:Date.now()});
  }
  async function createEntry({scope,accountId,bookId,detailId,mode,entry,grant}) {
    if(!scope?.botId||!scope?.conversationId||!UUID.test(bookId)||
       !['archive-manual','archive-auto','native-auto'].includes(mode)||
       !grant?.token||Date.now()-grant.at>25000)throw new Error('Entry-write authorization expired before the request. No write sent.');
    const result=await new Promise(resolve=>chrome.runtime.sendMessage({
      type:'DS_PRIVATE_LOREBOOK_ENTRY_CREATE',scope,accountId,bookId,detailId,mode,
      entry,authToken:grant.token
    },response=>resolve(chrome.runtime.lastError?{ok:false,status:'background-unavailable',ambiguous:true}:response||{ok:false,status:'no-response',ambiguous:true})));
    if(result?.ok&&result.verified===true)return {id:result.id,lorebookId:result.bookId,version:result.version};
    const error=new Error('SpicyChat entry creation '+String(result?.status||'could not be verified')+'. '+
      (result?.ambiguous?'Check and reconcile the Archive before retrying.':'No write was acknowledged.'));
    error.ambiguous=result?.ambiguous===true;
    throw error;
  }
  DS.privateLorebookAuth=Object.freeze({request,entryCreateSupported:true,prepareEntryCreate,createEntry});
})();
}
