"use strict";
// Experimental GitHub App Device Flow backup. Completely isolated from QoL Cloud.
// Secrets and non-extractable remembered device keys remain in this extension's
// background-only IndexedDB, never in chrome.storage or research ZIPs.
(() => {
  if (globalThis.DSQGitHubBackupLoaded) return;
  globalThis.DSQGitHubBackupLoaded = true;
  const ROOT = 'dragonscript-qol-backup/v1';
  const PREF_KEY = 'dsGithubBackupPrefsV1';
  const STATE_KEY = 'dsGithubBackupStateV1';
  const ALARM = 'ds-github-backup-12h-v1';
  const RESEARCH_ALARM = 'ds-github-research-next-v1';
  const RESEARCH_RESTORE_ALARM = 'ds-github-research-restore-v1';
  // Public GitHub App OAuth client ID, shared by all users of this extension.
  // Never include a client secret, private key, installation token or PAT.
  const BUILTIN_CLIENT_ID = 'Iv23liKyoFU1H2F46kEE';
  // GitHub issues both legacy Iv1. and newer Iv23... GitHub App client IDs.
  const APP_CLIENT_ID_PATTERN = /^Iv(?:1\.[a-fA-F0-9]{8,}|[0-9][a-zA-Z0-9]{12,})$/;
  const APP_INSTALL = 'https://github.com/apps/dragongraf-qol-backup/installations/new';
  const RESEARCH_RECORDS_PER_BATCH = 16; // Bound background events; resume with the next alarm.
  const ENCRYPTION_CHECK = 'dragonscript-qol-backup-encryption-v1';
  const MAX_CHUNK_BYTES = 540000; // GitHub recommends objects around 1 MB or less.
  const DEFAULT_CATEGORIES = ['settings','lists','other'];
  const LIST_KEYS = ['blockedBots','favoriteBots','laterBots','notInterestedBots','openedChats'];
  const OTHER_KEYS = [
    'openedChatMeta','personas','savedPersonas','personaOrganization','oocTemplates',
    'favoriteCreators','followedCreators','creatorBotWatchV1','botOrganization',
    'chatOrganization','characterQolProfiles','botAvailability','botUnavailableRecoveryV1',
    'botArchive','lorebookStatus','lorebookBackups','chatbotLorebookLinks',
    'savedTextSnippets','contextKeeperData','chatSceneNotesV1','storyDayTrackerData',
    'rpStateTrackerData','chatNudgeSubscriptionsV1','generationProfiles','dsSmartFilterPresets',
    'dsSmartFilterPinnedPresets','dsBotEditorDraftHistory','chatBookmarks','recentlySeenBots',
    'soundscapes','tabCleanupSessions','tabCleanupTopics','tabCleanupEnrichment',
    'localActionHistory','dsMemoryVaultV1','quickDislikeHistoryV1','quickDislikeBulkStateV1',
    'quickLessLikeHistoryV1','quickLessLikeBulkStateV1'
  ];
  const mediaKeys = ['soundscapeAudioV1','chatBackgroundMediaV1'];
  let chain = Promise.resolve();
  let unlocked = null;
  let cancelled = false;
  function checkCancelled(){if(cancelled)throw Error('GitHub operation cancelled; verified remote snapshots and local data remain intact');}
  let progress = { phase:'idle',done:0,total:0,message:'' };
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = bytes => { let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s); };
  const bytes = value => Uint8Array.from(atob(value), ch=>ch.charCodeAt(0));
  const hashHex = value => [...new Uint8Array(value)].map(x=>x.toString(16).padStart(2,'0')).join('');
  const random = n => crypto.getRandomValues(new Uint8Array(n));
  const id = () => crypto.randomUUID?.() || hashHex(random(16).buffer);
  const path = suffix => `${ROOT}/${suffix}`;
  const sleep = n => new Promise(resolve => setTimeout(resolve,n));
  const storeGet = keys => new Promise((resolve,reject)=>chrome.storage.local.get(keys,v=> chrome.runtime.lastError?reject(Error(chrome.runtime.lastError.message)):resolve(v||{})));
  const storeSet = values => new Promise((resolve,reject)=>chrome.storage.local.set(values,()=>chrome.runtime.lastError?reject(Error(chrome.runtime.lastError.message)):resolve()));
  const cleanError = e => String(e?.message || e || 'Unknown error').replace(/gh[uro]_[a-zA-Z0-9]+/g,'[redacted]').slice(0,300);
  const update = (phase,message,done=0,total=0) => {progress={phase,message,done,total,at:Date.now()};};
  async function db(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open('dsGithubBackupPrivateV1',2);
      request.onupgradeneeded=()=>{
        const database=request.result;
        if(!database.objectStoreNames.contains('secrets'))database.createObjectStore('secrets');
        if(!database.objectStoreNames.contains('research-parts'))database.createObjectStore('research-parts');
        if(!database.objectStoreNames.contains('research'))database.createObjectStore('research',{keyPath:'key'});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error || Error('Private credential storage unavailable'));
    });
  }
  async function privateValue(key,value,deleteKey=false){
    const database=await db();
    try {return await new Promise((resolve,reject)=>{
      const tx=database.transaction('secrets',value===undefined&&!deleteKey?'readonly':'readwrite');
      const request=deleteKey?tx.objectStore('secrets').delete(key):value===undefined?tx.objectStore('secrets').get(key):tx.objectStore('secrets').put(value,key);
      let result;
      request.onsuccess=()=>{result=request.result;};request.onerror=()=>reject(request.error);
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error||Error('Private storage transaction aborted'));
    });}finally{database.close();}
  }
  // Complete a staged research record with one IndexedDB read transaction and
  // one cleanup transaction. The older per-part reads opened hundreds of DB
  // connections for large histories.
  async function readResearchParts(job,key,total){
    const database=await db();
    try{return await new Promise((resolve,reject)=>{
      const values=new Array(total),tx=database.transaction('secrets','readonly');
      const store=tx.objectStore('secrets');
      for(let i=0;i<total;i++){
        const index=i,req=store.get(`research-part:${job}:${key}:${i}`);
        req.onsuccess=()=>{values[index]=req.result;};
      }
      tx.oncomplete=()=>resolve(values);
      tx.onerror=()=>reject(tx.error||Error('Research staging read failed'));
      tx.onabort=()=>reject(tx.error||Error('Research staging read cancelled'));
    });}finally{database.close();}
  }
  async function clearResearchParts(job,key,total){
    const database=await db();
    try{return await new Promise((resolve,reject)=>{
      const tx=database.transaction('secrets','readwrite'),store=tx.objectStore('secrets');
      for(let i=0;i<total;i++)store.delete(`research-part:${job}:${key}:${i}`);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||Error('Research staging cleanup failed'));
      tx.onabort=()=>reject(tx.error||Error('Research staging cleanup cancelled'));
    });}finally{database.close();}
  }
  // Only the most recent ID, native count and verification time are used for
  // remote freshness checks. Message bodies and account details never leave
  // the encrypted Research catalog as metadata.
  function researchSummary(record) {
    if (!record?.complete || !record?.history?.complete ||
        !Array.isArray(record.history.messages) || !record.history.messages.length) return null;
    const messages = record.history.messages;
    const newest = String(messages.at(-1)?.id || '');
    const count = Number(record.history.expected ?? messages.length);
    if (!newest || !Number.isSafeInteger(count) || count < 1 || count !== messages.length) return null;
    return {messageCount: count, newestMessageId: newest, verifiedAt: Date.now()};
  }
  async function researchRemoteIndex(ids) {
    const p = await prefs();
    if (!isActive(p) || p.paused || !p.repository || !p.categories.includes('research'))
      return {ok: false, reason: 'not-configured'};
    if (!Array.isArray(ids) || ids.length > 10000) return {ok: false, reason: 'invalid-selection'};
    const wanted = new Set(ids.filter(id => /^[0-9a-f-]{36}$/i.test(String(id))).map(id => `conversation:${String(id).toLowerCase()}`));
    if (!wanted.size) return {ok: true, records: {}, indexed: 0};
    const keys = await getKeys(p.repository);
    const index = await readIndex(p.repository);
    const latest = index.value.snapshots?.[0];
    if (!latest?.manifest) return {ok: true, records: {}, indexed: 0};
    const snapshot = await readSnapshot(p.repository, latest.manifest, keys);
    if (!snapshot?.categories?.research) return {ok: true, records: {}, indexed: 0};
    const catalog = await readChunks(p.repository, snapshot.categories.research, keys);
    if (catalog?.schema !== 'dsq-research-catalog-v1' || !catalog.records || typeof catalog.records !== 'object')
      throw Error('Unsupported verified Research catalog');
    const found = {};
    let legacyRepaired = 0;
    const legacyStart = Date.now();
    for (const key of wanted) {
      const row = catalog.records[key];
      if (!row?.sha || !row?.ref) continue;
      let summary = row.summary;
      // Older GitHub research snapshots stored verified conversation records
      // without the tiny count/newest-ID summary. Recover that summary from
      // the matching private local staged record, not from the page or an
      // unverified network result. Store the small derived value separately so
      // a later index check does not parse giant chat records again.
      if (!summary) {
        const cacheKey=`research-summary:${key}`;
        const cached=await privateValue(cacheKey);
        if (cached?.sha===row.sha && (cached.summary || Date.now()-Number(cached.at||0)<6*3600000))
          summary=cached.summary;
        else if (legacyRepaired < 20 && Date.now()-legacyStart < 2500) {
          const local=await researchRecord(key);
          if (local?.complete && local?.sha===row.sha && local.record &&
              local.record.length < 80_000_000) {
            try {
              const actual=hashHex(await crypto.subtle.digest('SHA-256',enc.encode(local.record)));
              if (actual===row.sha) {
                summary=researchSummary(JSON.parse(local.record));
                if (summary) await privateValue(cacheKey,{sha:row.sha,summary,at:Date.now()});
              }
            } catch { /* Invalid legacy records never count as verified. */ }
          } else await privateValue(cacheKey,{sha:row.sha,summary:null,at:Date.now()});
          legacyRepaired++;
          if (legacyRepaired%5===0) await sleep(0);
        }
      }
      if (!summary || !Number.isSafeInteger(summary.messageCount) || summary.messageCount < 1 ||
          typeof summary.newestMessageId !== 'string' || !summary.newestMessageId ||
          !Number.isSafeInteger(summary.verifiedAt)) continue;
      found[key.slice('conversation:'.length)] = {
        messageCount: summary.messageCount, newestMessageId: summary.newestMessageId,
        verifiedAt: summary.verifiedAt
      };
    }
    return {ok: true, records: found, indexed: Object.keys(found).length,
      legacySummariesChecked: legacyRepaired};
  }
  async function researchStage(message){
    const key=String(message.recordKey||'');
    if(!/^(?:conversation|character):[0-9a-f-]{36}$/.test(key))throw Error('Invalid research record key');
    const job=String(message.job||'');
    if(!/^[a-zA-Z0-9_-]{8,100}$/.test(job))throw Error('Invalid research staging job');
    const total=Number(message.total),part=Number(message.part);
    if(!Number.isInteger(total)||total<1||total>1000||!Number.isInteger(part)||part<0||part>=total)
      throw Error('Invalid research payload chunk count');
    const payload=String(message.data||'');
    if(!payload||payload.length>150000)throw Error('Research transfer chunks must be smaller than 150 KB');
    const temp=`${job}:${key}:${part}`;
    await privateValue(`research-part:${temp}`,payload);
    if(part!==total-1)return {ok:true,staged:false};
    const strings=await readResearchParts(job,key,total);
    if(strings.some(value=>typeof value!=='string'))
      return {ok:true,staged:false,message:'Waiting for missing transfer chunks'};
    const raw=strings.join('');
    if(raw.length>80_000_000)throw Error('Research record exceeds the 80 MB safe limit');
    const record=JSON.parse(raw);
    if(record.schema!=='dsq-research-record-v1'||record.key!==key||record.complete!==true)
      throw Error('Refusing to stage an incomplete or unrelated research record');
    // Empty/incomplete history and unavailable Memories must not replace a
    // previously verified remote chat. Character fetch failures are similarly
    // excluded by the verified exporter hook.
    if(key.startsWith('conversation:') && (!record.history?.complete||!Array.isArray(record.history.messages)||
        record.nativeMemories?.status==='unavailable'||record.nativeMemories?.status==='not-checked'))
      throw Error('Research record failed completeness preflight');
    const sha=hashHex(await crypto.subtle.digest('SHA-256',enc.encode(raw)));
    const database=await db();let existing;
    try{
      existing=await new Promise((resolve,reject)=>{
        const req=database.transaction('research','readonly').objectStore('research').get(key);
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
      });
      const summary = key.startsWith('conversation:') ? researchSummary(record) : null;
      if(existing?.sha!==sha || (summary && !existing?.summary))await new Promise((resolve,reject)=>{
        const tx=database.transaction('research','readwrite');
        tx.objectStore('research').put({key,sha,record:raw,updatedAt:Date.now(),complete:true,summary});
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
      });
    }finally{database.close();}
    await clearResearchParts(job,key,total);
    return {ok:true,staged:existing?.sha!==sha,unchanged:existing?.sha===sha};
  }
  async function researchRows(){
    const database=await db();
    try{return await new Promise((resolve,reject)=>{
      const rows=[];const tx=database.transaction('research','readonly');
      const req=tx.objectStore('research').openCursor();
      req.onsuccess=()=>{
        const cur=req.result;
        if(!cur)return;
        // Keep only tiny metadata in RAM, never all conversation histories.
        rows.push({key:cur.value.key,sha:cur.value.sha,complete:cur.value.complete,summary:cur.value.summary||null});
        cur.continue();
      };
      req.onerror=()=>reject(req.error);
      tx.oncomplete=()=>resolve(rows);tx.onerror=()=>reject(tx.error);
    });}finally{database.close();}
  }
  async function researchRecord(key){
    const database=await db();
    try{return await new Promise((resolve,reject)=>{
      const req=database.transaction('research','readonly').objectStore('research').get(key);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });}finally{database.close();}
  }
  function normalizePrefs(source={}) {
    return {
      provider:['cloud','github','both'].includes(source.provider)?source.provider:'cloud',
      // Ignore stale per-device client IDs from the earlier preview. The app
      // identity is fixed so all users authorize the same public GitHub App.
      clientId:BUILTIN_CLIENT_ID,
      repository: /^[\w.-]+\/[\w.-]+$/.test(String(source.repository||'')) ? String(source.repository):'',
      automatic: source.automatic !== false,
      categories: Array.isArray(source.categories)?source.categories.filter(x=>['settings','lists','other','media','research'].includes(x)) : [...DEFAULT_CATEGORIES],
      plaintext: Array.isArray(source.plaintext)?source.plaintext.filter(x=>['settings','lists','other','media','research'].includes(x)) : [],
      rememberDevice:source.rememberDevice===true,
      paused:source.paused===true,
    };
  }
  async function prefs(){ return normalizePrefs((await storeGet([PREF_KEY]))[PREF_KEY]); }
  async function state(){return (await storeGet([STATE_KEY]))[STATE_KEY] || {};}
  async function patchState(patch){await storeSet({[STATE_KEY]:{...(await state()),...patch}});}
  function isActive(p){return p.provider==='github'||p.provider==='both';}
  async function apiRaw(token, endpoint,{method='GET',body,accept='application/vnd.github+json'}={}){
    const controller=new AbortController(),stop=setTimeout(()=>controller.abort(),45000);
    try {
      const response=await fetch(`https://api.github.com${endpoint}`,{
        method,headers:{'Accept':accept,'X-GitHub-Api-Version':'2022-11-28',...(token?{'Authorization':`Bearer ${token}`}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},
        body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'
      });
      let parsed={};try{parsed=await response.json();}catch{}
      if(!response.ok) {
        const err=Error(`GitHub HTTP ${response.status}: ${String(parsed.message||response.statusText).slice(0,140)}`);
        err.code=response.status;err.retryAfter=Number(response.headers.get('Retry-After')||0);
        throw err;
      }
      return parsed;
    } finally {clearTimeout(stop);}
  }
  async function oauth(fields,endpoint){
    const response=await fetch(`https://github.com/login/${endpoint}`,{
      method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams(fields).toString(),cache:'no-store'
    });
    const result=await response.json();
    if(!response.ok || (result.error && !['authorization_pending','slow_down'].includes(result.error)))
      throw Error(`GitHub authorization: ${result.error_description||result.error||response.status}`);
    return result;
  }
  async function token(){
    const item=await privateValue('oauth');
    if(!item?.accessToken)throw Error('Authorize your GitHub account first');
    if(!item.expiresAt||item.expiresAt-Date.now()>5*60000)return item.accessToken;
    if(!item.refreshToken||item.refreshExpiresAt < Date.now()+10000) throw Error('GitHub authorization expired; reconnect using Device Flow');
    const p=await prefs();
    const refreshed=await oauth({client_id:p.clientId,grant_type:'refresh_token',refresh_token:item.refreshToken},'oauth/access_token');
    if(!refreshed.access_token)throw Error('GitHub returned no refreshed token');
    await privateValue('oauth',{accessToken:refreshed.access_token,refreshToken:refreshed.refresh_token||item.refreshToken,
      expiresAt:Date.now()+Number(refreshed.expires_in||28800)*1000,
      refreshExpiresAt:Date.now()+Number(refreshed.refresh_token_expires_in||15897600)*1000});
    return refreshed.access_token;
  }
  async function api(endpoint,options={}){
    for(let attempt=0;;attempt++){
      try{return await apiRaw(await token(),endpoint,options);}
      catch(error){
        if(!([408,429,502,503,504].includes(error.code)||(error.code===403&&error.retryAfter>0)||error.name==='AbortError') || attempt>=3)throw error;
        await sleep(Math.max(error.retryAfter*1000,Math.min(2000*2**attempt,12000)));
      }
    }
  }
  async function beginAuthorization(){
    const p=await prefs();
    if(!APP_CLIENT_ID_PATTERN.test(p.clientId))throw Error('GitHub App OAuth Client ID is invalid (expected a public Iv23… or legacy Iv1. ID).');
    const result=await oauth({client_id:p.clientId,scope:'offline_access'},'device/code');
    if(!result.device_code||!result.user_code)throw Error('GitHub did not supply a device code');
    await privateValue('device-flow',{deviceCode:result.device_code,expiresAt:Date.now()+Number(result.expires_in||900)*1000,
      nextAt:Date.now()+Number(result.interval||5)*1000,interval:Math.max(5,Number(result.interval||5))*1000});
    return {ok:true,userCode:result.user_code,verificationUrl:'https://github.com/login/device',
      expiresAt:Date.now()+Number(result.expires_in||900)*1000,interval:Math.max(5,Number(result.interval||5))};
  }
  async function pollAuthorization(){
    const d=await privateValue('device-flow');if(!d)throw Error('Start GitHub Device Flow first');
    if(d.expiresAt<=Date.now()){await privateValue('device-flow',null,true);throw Error('Device code expired; start authorization again');}
    if(d.nextAt>Date.now())return {ok:true,pending:true,waitMs:d.nextAt-Date.now()};
    const p=await prefs();const response=await oauth({client_id:p.clientId,device_code:d.deviceCode,
      grant_type:'urn:ietf:params:oauth:grant-type:device_code'},'oauth/access_token');
    if(response.error==='authorization_pending'||response.error==='slow_down'){
      d.interval+=response.error==='slow_down'?5000:0;
      d.nextAt=Date.now()+d.interval;await privateValue('device-flow',d);
      return {ok:true,pending:true,waitMs:d.interval};
    }
    if(!response.access_token)throw Error('No user access token was provided');
    const auth={accessToken:response.access_token,refreshToken:response.refresh_token||'',
      expiresAt:response.expires_in?Date.now()+response.expires_in*1000:0,
      refreshExpiresAt:response.refresh_token_expires_in?Date.now()+response.refresh_token_expires_in*1000:0};
    await privateValue('oauth',auth);await privateValue('device-flow',null,true);
    try{const user=await api('/user');await patchState({githubUser:String(user.login||'')});}
    catch(error){await privateValue('oauth',null,true);throw error;}
    return {ok:true,connected:true};
  }
  async function repositories(){
    const found=[];for(let page=1;page<=4;page++){
      const result=await api(`/user/installations?per_page=100&page=${page}`);
      for(const installation of result.installations||[]){
        for(let p=1;p<=5;p++){
          const pageData=await api(`/user/installations/${installation.id}/repositories?per_page=100&page=${p}`);
          for(const repo of pageData.repositories||[])if(repo.private)found.push({fullName:repo.full_name,private:true});
          if((pageData.repositories||[]).length<100)break;
        }
      }
      if((result.installations||[]).length<100)break;
    }
    return found;
  }
  async function chooseRepo(repo){
    if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw Error('Choose a valid owner/repository name');
    const details=await api(`/repos/${repo}`);
    if(!details.private)throw Error('A private repository is required for QoL backups');
    if(details.archived||details.disabled)throw Error('Repository is archived or disabled');
    if(!details.permissions?.push)throw Error('The GitHub user/app lacks repository write permission; install the app with Contents: read/write for this repository');
    const accessible=await repositories();
    if(!accessible.some(item=>item.fullName.toLowerCase()===repo.toLowerCase()))
      throw Error('This private repository is not available to your GitHub App installation. Install the app with selected repository access first.');
    const p=await prefs();
    if(p.repository.toLowerCase()===repo.toLowerCase()) {
      // Re-verifying the current repository must not reset snapshots or keys.
      return {ok:true,repository:p.repository,alreadySelected:true};
    }
    unlocked=null;
    await storeSet({[PREF_KEY]:{...p,repository:repo}});
    await patchState({repository:repo,base:{},lastSnapshot:'',lastSyncedAt:0,conflicts:[],lastError:'',
      researchBackupProgress:null,researchRetryCount:0,researchRetryAt:0});
    return {ok:true,repository:repo,alreadySelected:false};
  }
  async function fileRead(repo,filepath){
    try{
      const result=await api(`/repos/${repo}/contents/${filepath}`);
      if(!result.content||result.encoding!=='base64')throw Error(`GitHub returned an unsupported file: ${filepath}`);
      return {value:JSON.parse(dec.decode(bytes(result.content.replace(/\s/g,'')))),sha:result.sha};
    }catch(error){if(error.code===404)return null;throw error;}
  }
  async function fileWrite(repo,filepath,value,sha){
    const content=b64(enc.encode(JSON.stringify(value)));
    const body={message:`DragonScript QoL backup: ${filepath.split('/').at(-1)}`,content,...(sha?{sha}:{})};
    return api(`/repos/${repo}/contents/${filepath}`,{method:'PUT',body});
  }
  async function readIndex(repo){
    const result=await fileRead(repo,path('index.json'));
    if(result&&result.value.schema!=='dsq-github-backup-index-v1')throw Error('Unknown GitHub backup index schema; refusing to overwrite');
    return result || {value:{schema:'dsq-github-backup-index-v1',snapshots:[],latest:null},sha:null};
  }
  async function config(repo,create=false){
    const existing=await fileRead(repo,path('config.json'));
    if(existing){if(existing.value.schema!== 'dsq-github-backup-crypto-v1')throw Error('Unknown encryption configuration');return existing.value;}
    if(!create)return null;
    const data={schema:'dsq-github-backup-crypto-v1',salt:b64(random(16)),iterations:310000,
      check:null,createdAt:new Date().toISOString()};
    // Do not publish a configuration until the user has provided a password.
    return data;
  }
  async function derive(password,c){
    if(typeof password!=='string'||password.length<10)throw Error('Use a backup password of at least 10 characters');
    const keyMaterial=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
    const raw=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes(c.salt),iterations:c.iterations,hash:'SHA-256'},keyMaterial,512));
    return {aes:await crypto.subtle.importKey('raw',raw.slice(0,32),'AES-GCM',false,['encrypt','decrypt']),
      mac:await crypto.subtle.importKey('raw',raw.slice(32,64),{name:'HMAC',hash:'SHA-256'},false,['sign'])};
  }
  async function sealBytes(payload,key){
    const iv=random(12),out=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,payload));
    return {encrypted:true,iv:b64(iv),data:b64(out)};
  }
  async function openBytes(payload,key){
    if(!key)throw Error('Unlock backup password first');
    return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(payload.iv)},key,bytes(payload.data)));
  }
  async function unlock(password,remember){
    const p=await prefs();if(!p.repository)throw Error('Choose a private repository first');
    let c=await config(p.repository, true);
    if(!/^[A-Za-z0-9+/=]{20,64}$/.test(String(c.salt||''))|| !Number.isInteger(c.iterations)||c.iterations<100000||c.iterations>600000)
      throw Error('Backup encryption configuration is malformed');
    const keys=await derive(password,c);
    if(c.check){
      let plain;try{plain=dec.decode(await openBytes(c.check,keys.aes));}catch{throw Error('Incorrect backup password or corrupted encryption metadata');}
      if(plain!==ENCRYPTION_CHECK)throw Error('Incorrect backup password');
    } else {
      const proof=await sealBytes(enc.encode(ENCRYPTION_CHECK),keys.aes);
      c={...c,check:proof};
      // Creation can race another device; a different password must not take over.
      try{await fileWrite(p.repository,path('config.json'),c);}catch(error){
        if(error.code!==409&&error.code!==422)throw error;
        c=await config(p.repository,false);
        try{const plain=dec.decode(await openBytes(c.check,keys.aes));if(plain!==ENCRYPTION_CHECK)throw Error('Mismatch');}
        catch{throw Error('Another device initialized encryption with a different password');}
      }
    }
    unlocked={...keys,repository:p.repository};
    if(remember){await privateValue('remembered',{...keys,repository:p.repository});}
    else await privateValue('remembered',null,true);
    await storeSet({[PREF_KEY]:{...p,rememberDevice:!!remember}});
    return {ok:true,remembered:!!remember};
  }
  async function getKeys(repo){
    if(unlocked?.repository===repo)return unlocked;
    const remembered=await privateValue('remembered');
    if(remembered?.repository===repo && remembered.aes && remembered.mac){unlocked=remembered;return remembered;}
    throw Error('Unlock GitHub backup on this device to encrypt or decrypt data');
  }
  async function objectIdentity(data,key){
    const digest=key?await crypto.subtle.sign('HMAC',key,data):await crypto.subtle.digest('SHA-256',data);
    return hashHex(digest);
  }
  async function putObject(repo,payload,keys,plain=false){
    const raw=ArrayBuffer.isView(payload) ? new Uint8Array(payload.buffer,payload.byteOffset,payload.byteLength) : payload instanceof ArrayBuffer ? new Uint8Array(payload) : enc.encode(String(payload));
    const digest=await objectIdentity(raw,plain?null:keys.mac);
    const target=path(`objects/${digest}.json`);
    const existing=await fileRead(repo,target);
    if(existing)return {id:digest,bytes:raw.length,plain};
    const value=plain?{schema:'dsq-object-v1',encrypted:false,data:b64(raw)}:{schema:'dsq-object-v1',...await sealBytes(raw,keys.aes)};
    try{await fileWrite(repo,target,value);}catch(error){if(error.code!==409&&error.code!==422)throw error;}
    const check=await fileRead(repo,target);
    if(!check)throw Error('Uploaded GitHub object could not be read back');
    const decoded=check.value.encrypted?await openBytes(check.value,keys.aes):bytes(check.value.data);
    if(await objectIdentity(decoded,plain?null:keys.mac)!==digest)throw Error('GitHub object failed integrity verification');
    return {id:digest,bytes:raw.length,plain};
  }
  async function readObject(repo,entry,keys){
    if(!/^[a-f0-9]{64}$/.test(String(entry?.id||'')))throw Error('Invalid backup object identifier');
    const response=await fileRead(repo,path(`objects/${entry.id}.json`));
    if(!response)throw Error(`Backup object ${entry.id.slice(0,12)} is missing`);
    const raw=response.value.encrypted?await openBytes(response.value,keys.aes):bytes(response.value.data);
    if(await objectIdentity(raw,entry.plain?null:keys.mac)!==entry.id)throw Error('Backup object hash mismatch; refusing to restore');
    return raw;
  }
  async function chunks(repo,data,keys,plain=false){
    const full=enc.encode(JSON.stringify(data)),all=[];
    for(let start=0;start<full.length;start+=MAX_CHUNK_BYTES){
      checkCancelled();
      all.push(await putObject(repo,full.subarray(start,start+MAX_CHUNK_BYTES),keys,plain));
      update('upload',`Uploaded/reused ${all.length} chunks`,Math.min(start+MAX_CHUNK_BYTES,full.length),full.length);
      await sleep(0);
    }
    if(!all.length)all.push(await putObject(repo,enc.encode('null'),keys,plain));
    return {parts:all,plain};
  }
  async function readChunks(repo,entry,keys){
    if(!Array.isArray(entry.parts)||!entry.parts.length||entry.parts.length>20000)throw Error('Invalid category manifest');
    const values=[];for(const part of entry.parts){checkCancelled();values.push(await readObject(repo,part,keys));}
    let total=0;for(const v of values)total+=v.length;
    const combined=new Uint8Array(total);let at=0;for(const v of values){combined.set(v,at);at+=v.length;}
    return JSON.parse(dec.decode(combined));
  }
  const partsEqual = (a,b) => JSON.stringify(a?.parts?.map(p=>p.id)||[])===JSON.stringify(b?.parts?.map(p=>p.id)||[]);
  async function readSnapshot(repo,reference,keys){
    if(!reference)return null;
    const raw=await readObject(repo,reference,keys);
    const value=JSON.parse(dec.decode(raw));
    if(value.schema!=='dsq-github-backup-snapshot-v1')throw Error('Unsupported snapshot version');
    return value;
  }
  const LARGE_KEYS = ['botAvailability','botArchive','lorebookStatus'];
  async function readLocalCategory(category){
    let names=[];
    if(category==='settings'){
      const index=await storeGet(['dsSettingsIndexV1','settings']);
      names=Array.isArray(index.dsSettingsIndexV1) ? index.dsSettingsIndexV1.filter(s=>typeof s==='string'&&s.length<150).map(s=>'dsSettingV1:'+s) : [];
      // A new device needs the granular index along with each setting value.
      // Keep the legacy settings object for older and partially migrated installations.
      names.push('dsSettingsIndexV1','dsGranularSettingsV1','settings');
    }else if(category==='lists')names=LIST_KEYS;
    else if(category==='other')names=OTHER_KEYS;
    else if(category==='media')names=mediaKeys;
    else return null;
    const data=await storeGet(names);
    if(category==='settings'){
      const index=await storeGet(['dsSettingsIndexV1','dsGranularSettingsV1','settings']);
      if(Array.isArray(index.dsSettingsIndexV1))data.dsSettingsIndexV1=index.dsSettingsIndexV1;
      if(index.dsGranularSettingsV1!==undefined)data.dsGranularSettingsV1=index.dsGranularSettingsV1;
      if(index.settings && typeof index.settings==='object')data.settings=index.settings;
    }
    if(category==='other'){
      // These stores are migrated to a separate background-owned IndexedDB.
      // If an IndexedDB read fails, abort instead of backing up an incomplete copy.
      if(typeof getLargeStorageValues !== 'function')throw Error('IndexedDB large-data reader is unavailable');
      const large=await getLargeStorageValues(LARGE_KEYS);
      for(const key of LARGE_KEYS)data[key]=large[key];
    }
    return Object.fromEntries(Object.entries(data).filter(([k,v])=>v!==undefined && !/token|password|secret|apikey|auth/i.test(k)));
  }
  async function writeLocalCategory(category,value,merge=false){
    if(!value || typeof value!=='object'||Array.isArray(value))throw Error('Invalid restored category');
    const allowed=new Set(category==='lists'?LIST_KEYS:category==='other'?OTHER_KEYS:category==='media'?mediaKeys:[]);
    const input={};
    for(const [k,v] of Object.entries(value)){
      if(category==='settings' && (k==='settings'||k==='dsSettingsIndexV1'||k==='dsGranularSettingsV1'||(k.startsWith('dsSettingV1:')&&k.length<200)))input[k]=v;
      else if(allowed.has(k))input[k]=v;
    }
    if(merge){
      const existing=await storeGet(Object.keys(input));
      for(const [key,v] of Object.entries(input)){
        if(existing[key]!==undefined){
          if(category==='lists' && Array.isArray(existing[key]) && Array.isArray(v)){
            input[key]=[...new Set([...existing[key],...v])];
          }else if(category==='lists' && existing[key]?.meta && v?.meta &&
              typeof existing[key].meta==='object' && typeof v.meta==='object'){
            // Blocked/Favorites/Later use per-ID meta dictionaries, not ids[].
            // Local versions win on the same ID; verified recovered IDs are added.
            input[key]={...v,...existing[key],meta:{...v.meta,...existing[key].meta}};
          }else if(category==='lists' && Array.isArray(existing[key]?.ids)&&Array.isArray(v?.ids)){
            input[key]={...existing[key],...v,ids:[...new Set([...existing[key].ids,...v.ids])],
              ...(Array.isArray(v.names)?{names:[...new Set([...(existing[key].names||[]),...v.names])]}:{})};
          }else delete input[key];
        }
      }
    }
    const largeValues={};
    if(category==='other')for(const key of LARGE_KEYS){
      if(Object.prototype.hasOwnProperty.call(input,key)){
        largeValues[key]=input[key];delete input[key];
      }
    }
    // Preserve the index of granular settings when restoring. Without it,
    // settings keys exist on disk but the Options/runtime loader cannot see them.
    if(category==='settings'){
      const granules=Object.keys(input).filter(k=>k.startsWith('dsSettingV1:')).map(k=>k.slice('dsSettingV1:'.length));
      if(granules.length){
        const prior=(await storeGet(['dsSettingsIndexV1'])).dsSettingsIndexV1;
        const current=Array.isArray(input.dsSettingsIndexV1)?input.dsSettingsIndexV1:[];
        input.dsSettingsIndexV1=[...new Set([...(Array.isArray(prior)?prior:[]),...current,...granules])];
      }
    }
    if(Object.keys(input).length)await storeSet(input);
    if(Object.keys(largeValues).length){
      if(merge){
        if(typeof mergeLargeStorageEntries!=='function')throw Error('Large-data merge reader is unavailable');
        for(const [key,data] of Object.entries(largeValues))await mergeLargeStorageEntries(key,data?.meta||{});
      }else{
        if(typeof setLargeStorageValues!=='function')throw Error('Large-data writer is unavailable');
        await setLargeStorageValues(largeValues);
      }
    }
    return Object.keys(input).length+Object.keys(largeValues).length;
  }
  async function localReference(category,value,keys,plain){
    const full=enc.encode(JSON.stringify(value)),refs=[];
    for(let start=0;start<full.length;start+=MAX_CHUNK_BYTES){
      const portion=full.subarray(start,start+MAX_CHUNK_BYTES);
      refs.push({id:await objectIdentity(portion,plain?null:keys.mac),bytes:portion.length,plain});
      if(refs.length%8===0)await sleep(0);
    }
    return {parts:refs,plain};
  }
  async function backup({mode='backup',force=false}={}){
    const p=await prefs();if(!isActive(p))throw Error('Enable GitHub or Both as the backup provider');
    if(!p.repository)throw Error('Choose a private GitHub repository');
    const keys=await getKeys(p.repository);const repo=p.repository;
    const index=await readIndex(repo);
    const latest=index.value.snapshots?.[0]||null;
    const remote=await readSnapshot(repo,latest?.manifest,keys);
    const baseline= (await state()).base || {};
    let merged={...(remote?.categories||{})}, changed=[], downloads=[], conflicts=[];
    let alreadyUploadedResearch=0;
    let remainingResearch=0;
    let researchSnapshotProgress=null;
    const pendingUploads=[];
    for(const category of p.categories){
      checkCancelled();
      if(category==='research')continue;
      const value=await readLocalCategory(category);
      if(!value||!Object.keys(value).length){
        if(merged[category] && mode==='sync')downloads.push({category,entry:merged[category],merge:true});
        continue; // missing local data never causes remote deletion
      }
      // Preserve remote keys absent from local storage. A partial local read
      // must never be interpreted as a request to delete a remote key.
      if(merged[category]){
        const old=await readChunks(repo,merged[category],keys);
        const missing=Object.keys(old||{}).some(key=>!Object.prototype.hasOwnProperty.call(value,key));
        if(missing && mode==='sync')downloads.push({category,entry:merged[category],merge:true});
        for(const [key,prior] of Object.entries(old||{})){
          if(!Object.prototype.hasOwnProperty.call(value,key)){value[key]=prior;continue;}
          const local=value[key];
          // A partially populated local list / IDB category cannot erase
          // existing remote members. Explicit deletion needs separate review.
          if(prior&&local&&typeof prior==='object'&&typeof local==='object' &&
              !Array.isArray(prior)&&!Array.isArray(local)){
            const mergedValue={...prior,...local};
            if(prior.meta&&local.meta&&typeof prior.meta==='object'&&typeof local.meta==='object')
              mergedValue.meta={...prior.meta,...local.meta};
            if(category==='lists')for(const field of ['ids','names'])
              if(Array.isArray(prior[field])&&Array.isArray(local[field]))
                mergedValue[field]=[...new Set([...prior[field],...local[field]])];
            value[key]=mergedValue;
          }
        }
      }
      const local=await localReference(category,value,keys,p.plaintext.includes(category));
      const r=merged[category],base=baseline[category];
      if(partsEqual(local,r))continue;
      if(!r || (base && partsEqual(base,r))){pendingUploads.push({category,value,plain:local.plain});changed.push(category);continue;}
      if(base && partsEqual(local,base) && mode==='sync'){
        downloads=downloads.filter(item=>item.category!==category);
        downloads.push({category,entry:r,merge:false});continue;
      }
      conflicts.push(category);
    }
    if(conflicts.length){
      await patchState({lastError:`Conflicts: ${conflicts.join(', ')}`,conflicts,lastErrorAt:Date.now()});
      return {ok:false,conflict:true,categories:conflicts,message:'Local and GitHub data differ. Use selective restore/merge or resolve these categories before backup; nothing was overwritten.'};
    }
    for(const change of pendingUploads){
      checkCancelled();
      update('upload',`Uploading ${change.category}`,0,1);
      merged[change.category]=await chunks(repo,change.value,keys,change.plain);
    }
    if(p.categories.includes('research')){
      update('research', 'Comparing verified research checkpoint records…');
      const catalog=merged.research ? await readChunks(repo,merged.research,keys) : {schema:'dsq-research-catalog-v1',records:{}};
      if(catalog.schema!=='dsq-research-catalog-v1'||!catalog.records||typeof catalog.records!=='object')
        throw Error('Unknown Research Export catalog; existing backup was preserved');
      const rows=await researchRows();
      const valid=rows.filter(row=>row.complete&&row.sha);
      const total=valid.length;
      const alreadyOnGithub=valid.filter(row=>catalog.records[row.key]?.sha===row.sha).length;
      let uploaded=0, catalogMetadataChanged=false;
      update('research','Checking verified Research Export records',alreadyOnGithub,total);
      const started=Date.now();
      for(const row of rows){
        checkCancelled();
        if(!row.complete||!row.sha)continue;
        if(catalog.records[row.key]?.sha===row.sha) {
          let summary=row.summary;
          if (!summary && !catalog.records[row.key].summary) {
            const cached=await privateValue(`research-summary:${row.key}`);
            if (cached?.sha===row.sha) summary=cached.summary;
          }
          if (summary && !catalog.records[row.key].summary) {
            // Metadata-only migration: the same verified Research object
            // stays on GitHub; no chat history is uploaded again.
            catalog.records[row.key].summary = summary;
            catalogMetadataChanged = true;
          }
          continue;
        }
        // Bound each background event to keep large initial imports resumable.
        // Every committed subset becomes a verified snapshot, never a partial replacement.
        if(uploaded>=RESEARCH_RECORDS_PER_BATCH || (uploaded>0 && Date.now()-started>70000))break;
        const record=await researchRecord(row.key);
        if(!record?.complete||record.sha!==row.sha||!record.record)continue;
        // Every changed verified record becomes a content-addressed object;
        // unchanged chats and character metadata are not uploaded again.
        const stored=await chunks(repo,JSON.parse(record.record),keys,p.plaintext.includes('research'));
        const prior=catalog.records[row.key];
        catalog.records[row.key]={sha:row.sha,ref:stored,...(row.summary ? {summary:row.summary} : {})};
        uploaded++;
        update('research',`Uploading batch: ${uploaded} records; ${alreadyOnGithub} already indexed`,alreadyOnGithub,total);
        if(uploaded%5===0)await sleep(150);
        if(uploaded>=RESEARCH_RECORDS_PER_BATCH)break;
      }
      remainingResearch=valid.filter(row=>catalog.records[row.key]?.sha!==row.sha).length;
      alreadyUploadedResearch=uploaded;
      // Display only committed counts from snapshots. A record isn't safely on
      // GitHub until its catalog and the snapshot index are both verified.
      researchSnapshotProgress={total,completed:total-remainingResearch,remaining:remainingResearch};
      if(uploaded || catalogMetadataChanged){
        merged.research=await chunks(repo,catalog,keys,false);
        changed.push('research');
        pendingUploads.push({category:'research',alreadyUploaded:true});
      }
      // A new verified export may include thousands of conversations. Continue
      // incrementally on the next alarm, rather than one unbounded SW event.
      if(remainingResearch)pendingUploads.push({category:'research-continuation',remaining:remainingResearch});
    }
    // Only apply remote-only changes AFTER all remote writes are successful.
    // Conservative sync: a missing local category is never deleted.
    if(mode==='sync')for(const d of downloads){
      checkCancelled();
      const value=await readChunks(repo,d.entry,keys);
      await writeLocalCategory(d.category,value,d.merge!==false);
    }
    const needsContinuation=pendingUploads.some(x=>x.category==='research-continuation');
    const realUploads=pendingUploads.filter(x=>x.category!=='research-continuation');
    if(!realUploads.length && !force){
      await patchState({base:merged,lastSyncedAt:Date.now(),lastError:'',conflicts:[],
        ...(researchSnapshotProgress?{researchBackupProgress:{...researchSnapshotProgress,updatedAt:Date.now()},researchRetryCount:0,researchRetryAt:0}:{})});
      if(needsContinuation)try{chrome.alarms.create(RESEARCH_ALARM,{when:Date.now()+90000});}catch{}
      return {ok:true,unchanged:true,uploaded:0,downloaded:downloads.length,snapshots:index.value.snapshots?.length||0,pendingResearch:needsContinuation};
    }
    const newSnapshot={schema:'dsq-github-backup-snapshot-v1',snapshotId:id(),deviceId:(await state()).deviceId||id(),
      createdAt:new Date().toISOString(),categories:merged,parent:latest?.id||null,
      complete:true};
    const stored=await putObject(repo,enc.encode(JSON.stringify(newSnapshot)),keys,false);
    // Only the small index changes after all immutable content verified.
    const nextIndex={schema:'dsq-github-backup-index-v1',latest:newSnapshot.snapshotId,
      snapshots:[{id:newSnapshot.snapshotId,createdAt:newSnapshot.createdAt,manifest:stored},...(index.value.snapshots||[])].slice(0,5)};
    try{await fileWrite(repo,path('index.json'),nextIndex,index.sha);}catch(error){
      if(error.code===409||error.code===422)throw Error('GitHub backup index changed on another device. Nothing was deleted; Sync Now to reconcile.');
      throw error;
    }
    const check=await readIndex(repo);
    if(check.value.latest!==newSnapshot.snapshotId)throw Error('Snapshot index verification failed');
    await patchState({base:merged,lastSyncedAt:Date.now(),lastSnapshot:newSnapshot.snapshotId,lastError:'',conflicts:[],deviceId:newSnapshot.deviceId,
      ...(researchSnapshotProgress?{researchBackupProgress:{...researchSnapshotProgress,updatedAt:Date.now()},researchRetryCount:0,researchRetryAt:0}:{})});
    if(needsContinuation)try{chrome.alarms.create(RESEARCH_ALARM,{when:Date.now()+90000});}catch{}
    return {ok:true,uploaded:realUploads.length,downloaded:downloads.length,snapshot:newSnapshot.snapshotId,snapshots:nextIndex.snapshots.length,pendingResearch:needsContinuation};
  }
  // Research recovery is deliberately isolated from live SpicyChat storage.
  // A selected, integrity-checked record is restored into our private cache;
  // it never edits/deletes native messages or memory. Run in bounded batches
  // to avoid the MV3 background event lifetime and survive restarts.
  async function recoverResearchBatch(job){
    const p=await prefs();const repo=p.repository;
    if(!repo||repo!==job.repository)throw Error('Repository changed while Research recovery was pending');
    const keys=await getKeys(repo);
    const index=await readIndex(repo);
    const target=index.value.snapshots?.find(x=>x.id===job.snapshotId);
    if(!target)throw Error('Selected Research recovery snapshot is no longer in the retained index');
    const snapshot=await readSnapshot(repo,target.manifest,keys);
    if(!snapshot.categories?.research)throw Error('The selected snapshot does not contain Research data');
    const catalog=await readChunks(repo,snapshot.categories.research,keys);
    if(catalog?.schema!=='dsq-research-catalog-v1'||!catalog.records||typeof catalog.records!=='object')
      throw Error('Invalid Research recovery catalog');
    const names=Object.keys(catalog.records).filter(x=>/^(?:conversation|character):[0-9a-f-]{36}$/.test(x)).sort();
    let count=0,processed=0,lastKey=job.afterKey||'';
    for(let indexInList=0;indexInList<names.length;indexInList++){
      const key=names[indexInList];
      if(key<=lastKey)continue;
      checkCancelled();
      const row=catalog.records[key];
      if(!row?.sha||!row.ref)throw Error(`Invalid Research record reference: ${key}`);
      const existing=await researchRecord(key);
      if(!job.merge || !existing?.complete){
        const payload=await readChunks(repo,row.ref,keys);
        const raw=JSON.stringify(payload);
        const sha=hashHex(await crypto.subtle.digest('SHA-256',enc.encode(raw)));
        if(sha!==row.sha||payload.schema!=='dsq-research-record-v1'||payload.key!==key||payload.complete!==true)
          throw Error(`Integrity or completeness error recovering ${key}`);
        if(key.startsWith('conversation:')&&(!payload.history?.complete||!Array.isArray(payload.history.messages)))
          throw Error(`Incomplete chat history in recovered Research record ${key}`);
        const database=await db();
        try{await new Promise((resolve,reject)=>{const tx=database.transaction('research','readwrite');
          tx.objectStore('research').put({key,sha,record:raw,updatedAt:Date.now(),complete:true});
          tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
        finally{database.close();}
        count++;
      }
      lastKey=key;processed++;
      update('research-restore',`Verified Research records restored: ${(job.restored||0)+count}`,indexInList+1,names.length);
      if(processed%8===0)await sleep(0);
      if(processed>=8)break;
    }
    const lastIndex=lastKey?names.indexOf(lastKey):-1;
    const remaining=lastIndex<0?names.length:Math.max(0,names.length-lastIndex-1);
    if(remaining){
      await patchState({pendingRestore:{...job,afterKey:lastKey,restored:(job.restored||0)+count}});
      try{chrome.alarms.create(RESEARCH_RESTORE_ALARM,{when:Date.now()+60000});}catch{}
    }else await patchState({pendingRestore:null});
    return {ok:true,restored:count,totalRestored:(job.restored||0)+count,remaining,stagedLocally:true};
  }
  async function listSnapshots(){
    const p=await prefs();if(!p.repository)throw Error('Choose a GitHub repository');
    const index=await readIndex(p.repository);
    return {ok:true,snapshots:(index.value.snapshots||[]).map(x=>({id:x.id,createdAt:x.createdAt})),current:index.value.latest};
  }
  async function restore(snapshotId,categories,merge=true){
    const p=await prefs();const keys=await getKeys(p.repository);
    const index=await readIndex(p.repository),ref=index.value.snapshots?.find(x=>x.id===snapshotId);
    if(!ref)throw Error('Requested snapshot not among the latest five');
    const snapshot=await readSnapshot(p.repository,ref.manifest,keys);
    const changed=[];let researchRecovery=null;
    for(const category of categories||[]){
      checkCancelled();
      if(category==='research' && snapshot.categories?.research){
        const job={repository:p.repository,snapshotId,merge,afterKey:'',restored:0};
        await patchState({pendingRestore:job});
        researchRecovery=await recoverResearchBatch(job);
        changed.push('research');continue;
      }
      if(!['settings','lists','other','media'].includes(category)||!snapshot.categories?.[category])continue;
      update('restore',`Restoring ${category}`,changed.length,categories.length);
      const value=await readChunks(p.repository,snapshot.categories[category],keys);
      await writeLocalCategory(category,value,merge);
      changed.push(category);
    }
    // Explicit user-selected restore/merge resolves this device's ancestor for
    // selected categories, without marking untouched categories synchronized.
    if(changed.length){const st=await state();const base={...(st.base||{})};
      for(const name of changed)base[name]=snapshot.categories[name];
      await patchState({base,conflicts:[],lastError:''});
    }
    return {ok:true,restored:changed,merge,researchRecovery};
  }
  // Selective, bounded recovery of original verified research records to the
  // private local cache. Restored records can be re-exported/re-synchronized;
  // this never writes into SpicyChat chats or overwrites history checkpoints.
  async function restoreResearch(snapshotId,recordKey='',offset=0,replace=false){
    const p=await prefs();const keys=await getKeys(p.repository);
    const index=await readIndex(p.repository);
    const ref=index.value.snapshots?.find(x=>x.id===snapshotId);
    if(!ref)throw Error('Select one of the five indexed snapshots first');
    const snapshot=await readSnapshot(p.repository,ref.manifest,keys);
    if(!snapshot.categories?.research)throw Error('This snapshot contains no research catalog');
    const catalog=await readChunks(p.repository,snapshot.categories.research,keys);
    if(catalog.schema!=='dsq-research-catalog-v1'||!catalog.records)throw Error('Unsupported research recovery index');
    const available=Object.keys(catalog.records).sort();
    const filtered=recordKey?available.filter(x=>x===recordKey):available;
    const start=Math.max(0,Math.min(filtered.length,Math.floor(Number(offset)||0)));
    const selected=filtered.slice(start,start+6);
    const results={restored:0,unchanged:0,conflicts:[],invalid:0};
    for(const key of selected){
      update('research-recovery',`Restoring ${key}`,results.restored+results.unchanged,selected.length);
      const remote=await readChunks(p.repository,catalog.records[key].ref,keys);
      const raw=JSON.stringify(remote);
      const digest=hashHex(await crypto.subtle.digest('SHA-256',enc.encode(raw)));
      if(remote.schema!=='dsq-research-record-v1'||remote.key!==key||remote.complete!==true ||
          digest!==catalog.records[key].sha){results.invalid++;continue;}
      const previous=await researchRecord(key);
      if(previous?.sha===digest){results.unchanged++;continue;}
      if(previous && !replace){results.conflicts.push(key);continue;}
      const database=await db();
      try{await new Promise((resolve,reject)=>{
        const tx=database.transaction('research','readwrite');
        tx.objectStore('research').put({key,sha:digest,record:raw,updatedAt:Date.now(),complete:true});
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
      });}finally{database.close();}
      results.restored++;
    }
    return {ok:!results.conflicts.length && !results.invalid, ...results, total:filtered.length,
      nextOffset:start+selected.length,remaining:filtered.length-(start+selected.length),
      message:results.conflicts.length?'Changed local research records were kept; use explicit replace to resolve.':
        results.invalid?'Failed checksum/completeness verification; no invalid records were saved.':'Research records verified and recovered to the private local cache.'};
  }
  async function setPrefs(next){
    const previous=await prefs();const merged=normalizePrefs({...previous,...next});
    if(merged.plaintext.length){
      if(!next.plaintextConfirmed && JSON.stringify(previous.plaintext)!==JSON.stringify(merged.plaintext))
        throw Error('Plaintext storage requires explicit confirmation; sensitive data would be readable in GitHub');
    }
    if(next.repository!==undefined && next.repository!==previous.repository)
      throw Error('Use Choose Repository to validate GitHub permissions before changing repository');
    await storeSet({[PREF_KEY]:merged});await ensureAlarm();
    return {ok:true,provider:merged.provider};
  }
  async function ensureAlarm(){
    const p=await prefs();
    if(!isActive(p)||!p.automatic||p.paused||!p.repository){try{await chrome.alarms.clear(ALARM);}catch{}return;}
    try{chrome.alarms.create(ALARM,{periodInMinutes:720});}catch{}
  }
  async function autoRun(){
    const p=await prefs();if(!isActive(p)||!p.automatic||p.paused||!p.repository)return;
    const tabs=await chrome.tabs.query({url:['https://spicychat.ai/*','https://www.spicychat.ai/*']});
    if(!tabs.length)return; // Backup only while QoL is actively present.
    const current=await state();
    const age=Date.now()-Number(current.lastSyncedAt||0);
    if(age<11*3600000)return;
    const busyChat=tabs.some(tab=>tab.active && !tab.discarded &&
      /^https:\/\/(?:www\.)?spicychat\.ai\/chat\/[0-9a-f-]{36}/i.test(String(tab.url||'')));
    if(busyChat && current.lastSyncedAt && age<14*3600000){
      // Try again later, but don't postpone a verified backup indefinitely.
      try{chrome.alarms.create(ALARM,{when:Date.now()+15*60000});}catch{}
      return;
    }
    if(p.provider==='both'){
      try{await new Promise(resolve=>chrome.runtime.sendMessage({type:'DS_QOL_SYNC_NOW'},response=>resolve(response)));}catch{}
    }
    const result=await backup({mode:'sync'});
    if(!result?.ok)await patchState({lastError:result?.message||'Automatic sync conflict'});
  }
  async function status(){
    const p=await prefs(),s=await state(),auth=await privateValue('oauth'),remember=await privateValue('remembered');
    return {ok:true,provider:p.provider,configured:!!p.clientId,publicClientId:p.clientId,connected:!!auth?.accessToken,githubUser:s.githubUser||'',
      repository:p.repository,automatic:p.automatic,paused:p.paused,categories:p.categories,plaintext:p.plaintext,
      remembered:!!remember?.aes && remember.repository===p.repository,
      unlocked:(!!unlocked?.aes && unlocked.repository===p.repository)||(!!remember?.aes && remember.repository===p.repository),
      lastSyncedAt:s.lastSyncedAt||0,lastError:s.lastError||'',conflicts:s.conflicts||[],
      pendingResearchRestore:s.pendingRestore||null,researchBackupProgress:s.researchBackupProgress||null,
      researchRetryAt:s.researchRetryAt||0,researchRetryCount:s.researchRetryCount||0,progress};
  }
  async function run(type,message){
    switch(type){
      case 'STATUS':return status();
      case 'CONFIGURE':return setPrefs(message.prefs||{});
      case 'AUTHORIZE':return beginAuthorization();
      case 'POLL':return pollAuthorization();
      case 'REPOSITORIES':return {ok:true,repositories:await repositories()};
      case 'CHOOSE_REPO':return chooseRepo(String(message.repository||''));
      case 'UNLOCK':return unlock(String(message.password||''),!!message.remember);
      case 'LOCK':unlocked=null;await privateValue('remembered',null,true);return {ok:true};
      case 'CANCEL':cancelled=true;await patchState({pendingRestore:null});return {ok:true,cancelled:true};
      case 'BACKUP':{
        cancelled=false;
        try {return await backup({mode:'backup'});}
        finally {update('idle','');}
      }
      case 'SYNC':{
        cancelled=false;
        try {
          const p=await prefs();
          if(p.provider==='both'){
            const cloud=await new Promise(resolve=>chrome.runtime.sendMessage({type:'DS_QOL_SYNC_NOW'},r=>resolve(chrome.runtime.lastError?{ok:false,message:chrome.runtime.lastError.message}:r)));
            const github=await backup({mode:'sync'});
            return {...github,cloudOk:!!cloud?.ok,...(!cloud?.ok?{warning:`QoL Cloud needs attention: ${cloud?.message||cloud?.error||'unavailable'}`}:{} )};
          }
          return await backup({mode:'sync'});
        } finally {update('idle','');}
      }
      case 'SNAPSHOTS':return listSnapshots();
      case 'RESTORE':cancelled=false;return restore(String(message.snapshotId||''),message.categories||[],message.merge!==false);
      case 'RESTORE_RESEARCH':return restoreResearch(String(message.snapshotId||''),String(message.recordKey||''),message.offset,!!message.replace);
      case 'RESEARCH_INDEX':return researchRemoteIndex(message.conversationIds);
      case 'RESEARCH_STAGE':return researchStage(message);
      case 'RESEARCH_FINISH':{
        const p=await prefs();
        const enabled=p.categories.includes('research')&&isActive(p)&&!!p.repository&&!p.paused;
        const authorized=enabled && !!(await privateValue('oauth'))?.accessToken;
        let unlockedNow=false;
        if(enabled&&authorized)try{await getKeys(p.repository);unlockedNow=true;}catch{}
        const queued=!!(enabled&&authorized&&unlockedNow);
        if(queued)try{chrome.alarms.create(RESEARCH_ALARM,{when:Date.now()+20000});}catch{}
        return {ok:true,queued,reason:queued?'GitHub research upload scheduled':
          !isActive(p)?'Choose GitHub or Both as backup provider':
          !p.categories.includes('research')?'Enable Verified Research Export data in backup categories':
          !p.repository?'Choose a private GitHub repository':p.paused?'GitHub backup is paused':
          !authorized?'Authorize GitHub Device Flow on this browser':'Unlock your GitHub backup password'};
      }
      case 'DISCONNECT':unlocked=null;await privateValue('oauth',null,true);await privateValue('remembered',null,true);return {ok:true};
      default:throw Error('Unsupported GitHub backup command');
    }
  }
  chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
    if(!String(message?.type||'').startsWith('DS_GITHUB_BACKUP_'))return false;
    // This provider is controlled by extension pages, not untrusted websites or content scripts.
    const action=String(message.type).slice('DS_GITHUB_BACKUP_'.length);
    const origin=String(sender.url||'');
    const ownExtension=origin.startsWith(chrome.runtime.getURL(''));
    const trustedResearchSender=/^https:\/\/(?:www\.)?spicychat\.ai\/chats(?:\?|$)/.test(origin) &&
      origin.includes('ds-research-export=1') && !!sender.tab;
    if(!ownExtension && !(trustedResearchSender && ['RESEARCH_INDEX','RESEARCH_STAGE','RESEARCH_FINISH'].includes(action))){
      sendResponse({ok:false,error:'GitHub controls require a trusted extension page'});return false;
    }
    const task=()=>run(action,message);
    // Poll/Status are read-only and should not starve behind large uploads.
    const promise=['STATUS','POLL','CANCEL','RESEARCH_INDEX'].includes(action)?task():(chain=chain.then(task,task));
    promise.then(sendResponse).catch(async error=>{
      const safe=cleanError(error);
      if(!['STATUS','POLL','AUTHORIZE'].includes(action))try{await patchState({lastError:safe,lastErrorAt:Date.now()});}catch{}
      sendResponse({ok:false,error:safe});
    });
    return true;
  });
  chrome.alarms.onAlarm.addListener(alarm=>{
    if(alarm.name!==ALARM&&alarm.name!==RESEARCH_ALARM&&alarm.name!==RESEARCH_RESTORE_ALARM)return;
    const work=alarm.name===RESEARCH_RESTORE_ALARM?async()=>{
      const s=await state();const p=await prefs();
      if(p.paused||!s.pendingRestore)return;
      cancelled=false;await recoverResearchBatch(s.pendingRestore);
    }:alarm.name===RESEARCH_ALARM?async()=>{
      const p=await prefs();if(!isActive(p)||!p.repository||!p.categories.includes('research')||p.paused)return;
      // Keep a fallback wakeup in case the service worker is stopped while
      // a large encrypted object is being uploaded. A successful batch moves
      // this alarm to its normal short continuation delay.
      try{chrome.alarms.create(RESEARCH_ALARM,{when:Date.now()+15*60000});}catch{}
      try {
        const result=await backup({mode:'sync'});
        if(!result?.pendingResearch)try{await chrome.alarms.clear(RESEARCH_ALARM);}catch{}
      } catch(error) {
        // One-time alarms disappear when fired. Recover from temporary GitHub
        // throttling/network errors without losing the last indexed snapshot.
        const message=cleanError(error);
        const transient=[403,408,429,500,502,503,504].includes(error?.code) ||
          error?.name==='AbortError' || /network|fetch failed|timed out/i.test(message);
        const previous=await state(),attempt=Math.max(0,Number(previous.researchRetryCount)||0)+1;
        if(transient && attempt<=5){
          const delay=Math.max(Number(error?.retryAfter||0)*1000,Math.min(3*60000*2**(attempt-1),45*60000));
          const when=Date.now()+delay;
          chrome.alarms.create(RESEARCH_ALARM,{when});
          await patchState({researchRetryCount:attempt,researchRetryAt:when,
            lastError:`GitHub research upload paused after a temporary error (${message}). Automatic retry ${attempt}/5 scheduled.`,lastErrorAt:Date.now()});
          return;
        }
        try{await chrome.alarms.clear(RESEARCH_ALARM);}catch{}
        throw error;
      } finally {update('idle','');}
    }:autoRun;
    chain=chain.then(work,work).catch(async e=>{try{await patchState({lastError:cleanError(e),lastErrorAt:Date.now()});}catch{}});
  });
  ensureAlarm().catch(()=>{});
})();
