'use strict';
// Opt-in private Archive setup: two fixed writes, authorized from the user's
// Lorebook creation tab. The site XHR bridge can fail at CORS/preflight before
// returning an HTTP status; the extension origin has prod.nd-api.com permission.
// Never store, log, or return the short-lived Firebase token.
(() => {
  const TYPE = 'DS_PRIVATE_ARCHIVE_SETUP_WRITE';
  const KEY = 'dsQolPrivateArchiveSetupV1';
  const CLONE_KEY = 'dsQolPrivateJsonCloneWriteV1';
  const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  const busy = new Set();
  const base = 'https://prod.nd-api.com';
  async function entryHash(entry) {
    const stable=JSON.stringify({name:entry.name,content:entry.content,keywords:entry.keywords});
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable));
    return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
  }
  async function putJob(job) {
    await new Promise((resolve,reject)=>chrome.storage.local.set({[`${CLONE_KEY}:${job.token}`]:job},()=>chrome.runtime.lastError?reject(Error('failed-to-save-import-progress')):resolve()));
  }
  async function readAuthenticated(path,token,version='') {
    const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),12000);
    try {
      const h={'Authorization':'Bearer '+token,'Accept':'application/json, text/plain, */*',
        'x-app-id':'spicychat','x-platform':'WEB','x-platform-os':'DESKTOP'};
      if (/^[\w.\-]{1,32}$/.test(version)) h['x-app-version']=version;
      const res=await fetch(base+path,{headers:h,credentials:'include',cache:'no-store',signal:ctl.signal});
      if(!res.ok)throw Error('verification-http-'+res.status);
      return await res.json();
    } finally {clearTimeout(timeout);}
  }
  function matchEntryUrl(page,id) {
    try {const url=new URL(page);return url.protocol==='https:'&&
      ['spicychat.ai','www.spicychat.ai'].includes(url.hostname)&&
      url.pathname.toLowerCase()===`/lorebook/edit/${id.toLowerCase()}/entries`;}
    catch{return false;}
  }
  async function addClonedEntry({job,path,payload,token,version}) {
    const id=String(job.lorebookId||'');
    if(!UUID.test(id)||path!==`/lorebooks/${id}/entries`)return {ok:false,status:'wrong-import-target'};
    const hash=await entryHash(payload);
    if(!Array.isArray(job.expectedEntryHashes)||!job.expectedEntryHashes.includes(hash))
      return {ok:false,status:'entry-not-in-approved-json'};
    const progress=job.entryProgress||{};
    if(progress[hash]==='uncertain')return {ok:false,status:'prior-entry-result-uncertain',ambiguous:true};
    const owner=String((await readAuthenticated('/v2/users',token,version))?.user?.id||'');
    const book=await readAuthenticated(`/lorebooks/${id}?sortBy=priority&lastSortPriority=0`,token,version);
    if(!owner||book?.id?.toLowerCase()!==id.toLowerCase()||book.creator_user_id!==owner||book.visibility!=='private'||book.name!==job.name)
      return {ok:false,status:'import-ownership-or-name-changed'};
    const count=Number(book.num_entries);
    if(!Number.isSafeInteger(count)||count<0||!Array.isArray(book.entries)||book.entries.length!==count)
      return {ok:false,status:'entry-list-incomplete'};
    const same=book.entries.find(item=>String(item?.name||'').toLowerCase()===payload.name.toLowerCase());
    if(same){
      // Skip existing means keep the native entry unchanged, even if the JSON
      // has different text or keywords. Clone and ordinary import use the
      // same name-bound verification, but only the explicitly selected Skip
      // policy permits an unequal existing entry.
      if(job.entryDuplicatePolicy!=='skip' && (same.content!==payload.content ||
        !Array.isArray(same.keywords) ||
        JSON.stringify(same.keywords)!==JSON.stringify(payload.keywords)))
        return {ok:false,status:'entry-name-conflict'};
      const next={...job,entryProgress:{...progress,[hash]:'verified'}};
      await putJob(next);
      return {ok:true,status:'already-exists',verified:true,data:{verified:true,status:'already-exists'}};
    }
    // A previous unconfirmed POST cannot be repeated, even after a browser restart.
    if(progress[hash]==='submitting')return {ok:false,status:'previous-submission-unconfirmed',ambiguous:true};
    await putJob({...job,entryProgress:{...progress,[hash]:'submitting'}});
    let result;
    const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),16000);
    try {
      const headers={'Authorization':'Bearer '+token,'Accept':'application/json, text/plain, */*',
        'Content-Type':'application/json','x-app-id':'spicychat','x-platform':'WEB','x-platform-os':'DESKTOP'};
      if(/^[\w.\-]{1,32}$/.test(version)) headers['x-app-version']=version;
      const resp=await fetch(`${base}${path}`,{method:'POST',headers,credentials:'include',cache:'no-store',
        body:JSON.stringify(payload),signal:ctl.signal});
      if(!resp.ok){
        const ambiguous=resp.status===408||resp.status===429||resp.status>=500;
        // A definite 4xx rejection (for example validation or moderation)
        // cannot have created an entry. Do not strand future user-approved
        // retries under the 'submitting' uncertainty marker. 408/429/5xx
        // remain uncertain and must NEVER be retried automatically.
        if(!ambiguous)await putJob({...job,entryProgress:{...progress,[hash]:'rejected'}});
        return {ok:false,status:'entry-post-http',httpStatus:resp.status,ambiguous};
      }
      result=await resp.json().catch(()=>null);
    }catch{return {ok:false,status:'entry-post-unconfirmed',ambiguous:true};}
    finally{clearTimeout(timeout);}
    if(!UUID.test(result?.id))return {ok:false,status:'entry-post-response-unverified',ambiguous:true};
    try {
      const after=await readAuthenticated(`/lorebooks/${id}?sortBy=priority&lastSortPriority=0`,token,version);
      const item=Array.isArray(after?.entries)&&after.entries.find(x=>String(x.id).toLowerCase()===result.id.toLowerCase());
      if(after.creator_user_id!==owner||after.visibility!=='private'||!item||item.name!==payload.name||item.content!==payload.content)
        return {ok:false,status:'entry-saved-but-not-yet-verified',ambiguous:true};
      await putJob({...job,entryProgress:{...progress,[hash]:'verified'}});
      return {ok:true,status:'created',verified:true,id:result.id,data:{verified:true,status:'created',id:result.id}};
    }catch{return {ok:false,status:'entry-readback-unavailable',ambiguous:true};}
  }

  const storedJob = (kind, token) => new Promise(resolve => {
    const name=kind==='clone'?`${CLONE_KEY}:${token}`:KEY;
    chrome.storage.local.get(kind==='clone'?[name,CLONE_KEY]:[name],r=>{
      if(chrome.runtime.lastError)return resolve(null);
      resolve(r?.[name]?.token===token?r[name]:(kind==='clone'&&r?.[CLONE_KEY]?.token===token?r[CLONE_KEY]:r?.[name]||null));
    });
  });
  const validAvatar = key => typeof key === 'string' && /^avatars\/[a-z0-9._/-]{1,250}\.(?:png|jpg|jpeg|webp)$/i.test(key) && !key.includes('..');
  function validToken(value) {
    if (typeof value !== 'string' || value.length > 12000 || !JWT.test(value)) return false;
    try {
      const body = value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = JSON.parse(atob(body.padEnd(Math.ceil(body.length / 4) * 4, '=')));
      return Number(json.exp || 0) * 1000 > Date.now() + 30000;
    } catch { return false; }
  }
  function validPayload(path, value, kind, job) {
    if (kind === 'clone') {
      if (!job || !value || typeof value !== 'object' || Array.isArray(value)) return false;
      if (/^\/lorebooks\/[0-9a-f-]{36}\/entries$/i.test(path)) return Object.keys(value).length === 3 &&
        typeof value.name==='string' && value.name.trim() && value.name.length<=50 &&
        typeof value.content==='string' && value.content.trim() && value.content.length<=2000 &&
        Array.isArray(value.keywords) && value.keywords.length<=12 &&
        value.keywords.every(x=>typeof x==='string' && !!x.trim() && x.length<=80);
      if (path === '/save-image') return Object.keys(value).length === 2 &&
        ['image/png','image/jpeg','image/webp'].includes(value.image_type) && /^[a-f0-9]{32}$/i.test(value.hash);
      if (path === '/lorebooks') return Object.keys(value).length === 5 &&
        value.name === job.name && value.description === job.description && value.visibility === 'private' &&
        Array.isArray(value.tags) && value.tags.length <= 12 &&
        value.tags.length === job.tags.length && value.tags.every((tag, i) => tag === job.tags[i]) &&
        validAvatar(value.avatar_url);
      return false;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (path === '/save-image') return Object.keys(value).length === 2 &&
      value.image_type === 'image/png' && value.hash === '1cb2bc293cab0f4bc7bf203e3829aee7';
    if (path === '/lorebooks') return Object.keys(value).length === 5 &&
      value.name === 'SpicyChat QoL Archive' &&
      typeof value.description === 'string' && value.description.length <= 100 &&
      value.visibility === 'private' && Array.isArray(value.tags) && value.tags.length === 0 &&
      typeof value.avatar_url === 'string' &&
      /^avatars\/[a-z0-9._/-]{1,250}\.(?:png|jpg|jpeg|webp)$/i.test(value.avatar_url) &&
      !value.avatar_url.includes('..');
    return false;
  }
  dsqRegisterBackgroundMessageHandler(TYPE, 'private-lorebook-bridge', (message, sender, respond) => {
    const page = String(sender?.url || sender?.tab?.url || '');
    let tokenFromUrl = '', kind = 'archive';
    const path = String(message?.path || '');
    const method = String(message?.method || '');
    const authToken = message?.authToken;
    const entryMatch=path.match(/^\/lorebooks\/([0-9a-f-]{36})\/entries$/i);
    try {
      const url=new URL(page);
      if (url.protocol==='https:' && ['spicychat.ai','www.spicychat.ai'].includes(url.hostname)) {
        if (url.pathname==='/lorebook/create') {
          tokenFromUrl=url.searchParams.get('dsQolArchiveSetup')||url.searchParams.get('dsQolLorebookClone')||'';
          kind=url.searchParams.has('dsQolLorebookClone')&&!url.searchParams.has('dsQolArchiveSetup')?'clone':'archive';
        } else if(entryMatch && matchEntryUrl(page,entryMatch[1])) {
          tokenFromUrl=String(message?.setupToken||'');kind='clone';
        }
      }
    }catch{}
    if(!sender?.tab?.id||!UUID.test(tokenFromUrl)||method!=='POST'||
      !(path==='/save-image'||path==='/lorebooks'||!!entryMatch)||
      (entryMatch&&kind!=='clone')||!validToken(authToken)||tokenFromUrl!==message?.setupToken){
      respond({ok:false,status:'blocked'});return false;
    }
    if (busy.has(tokenFromUrl)) { respond({ok:false,status:'already-running'}); return false; }
    busy.add(tokenFromUrl);
    (async () => {
      const job = await storedJob(kind,tokenFromUrl);
      const expectedStatus = entryMatch ? 'complete' : path === '/save-image' ? 'preparing' : 'submitting';
      if (job?.token !== tokenFromUrl || job?.status !== expectedStatus ||
        Date.now() - Number(job.createdAt || 0) > (entryMatch ? 60 : 5) * 60 * 1000) return {ok:false,status:'setup-expired-or-changed'};
      if (!validPayload(path, message?.payload, kind, job)) return {ok:false,status:'invalid-payload'};
      if(entryMatch) return await addClonedEntry({job,path,payload:message.payload,token:authToken,version:message.appVersion});
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 16000);
      try {
        const headers = {
          Accept: 'application/json, text/plain, */*',
          Authorization: 'Bearer ' + authToken,
          'Content-Type': 'application/json',
          'x-app-id': 'spicychat', 'x-platform': 'WEB', 'x-platform-os': 'DESKTOP',
        };
        const version = String(message?.appVersion || '');
        if (/^[\w.\-]{1,32}$/.test(version)) headers['x-app-version'] = version;
        const response = await fetch('https://prod.nd-api.com' + path, {
          method: 'POST', credentials: 'include', cache: 'no-store', headers,
          body: JSON.stringify(message.payload), signal: ctl.signal,
        });
        if (!response.ok) return {ok:false,status:'http',httpStatus:response.status};
        const data = await response.json().catch(() => null);
        if (!data || typeof data !== 'object') return {ok:false,status:'invalid-response',httpStatus:response.status};
        return {ok:true,status:'success',httpStatus:response.status,data};
      } catch (e) {
        return {ok:false,status:e?.name === 'AbortError' ? 'timeout' : 'background-network-error'};
      } finally {clearTimeout(timer);}
    })().then(result => { busy.delete(tokenFromUrl); respond(result); },
      () => { busy.delete(tokenFromUrl); respond({ok:false,status:'internal-error'}); });
    return true;
  });
})();
