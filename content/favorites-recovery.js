// Full Favorites coverage, native-account membership and reviewed cleanup.
// All reads are explicit. History is retained independently of live membership.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  'use strict';
  const DS=window.DragonScriptQoL;
  if(!DS)return;
  const HISTORY_STATUS='dsFavoritesHistorySyncStatusV1', OBSERVED_ADDED='dsFavoritesObservedAdditionsV1';
  const COVERAGE='dsFavoritesCoverageV1', META_PREFIX='dsFavoritesCoverageMetaV2:', BACKUP='dsFavoritesIdBackupV1', QUEUE='dsFavoritesLaterCleanupV1', SCAN='dsFavoritesScanStateV1', EXCLUSIONS='dsFavoritesCleanupExclusionsV1';
  const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const PANEL='ds-favorites-full-panel', STYLE='ds-favorites-full-style', TAB='ds-favorites-full-open';
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const uniq=ids=>[...new Set((ids||[]).map(x=>String(x||'').toLowerCase()).filter(x=>UUID.test(x)))];
  const text=x=>String(x||'').trim().slice(0,1200);
  const isPage=()=>/^\/(?:[a-z]{2}\/)?favorite-bots\/?$/i.test(location.pathname);
  const enabled=()=>isPage() && DS.state?.settings?.enabled!==false && DS.state?.settings?.enableFavoritesRecovery===true;
  let coverage=null,active=location.hash==='#recovered',busy=false,stop=false,page=1,selected=new Set(),search='',filter='all',sort='name',tag='',target=300;
  let status='No account recovery scan has run on this device.',cleanupExpanded=false,historySyncPending=false;
  let filterRenderTimer=null;
  let cleanupQueue=null, indexedBots=new Map(), exclusions=new Set(), lastRenderedLater=null, lastRenderedHistory=null;
  let observedAdditions={}; // First observed membership transitions, NOT original favorite dates.
  const VIEW_MODE='dsFullFavoritesDisplayModeV1', AUTO_TITLES='dsFavoritesAutoLoadPublicTitlesV1';
  const RESUME_NATIVE='dsFullFavoritesNativeResumeV1';
  let nativeRefreshNeeded=false;
  let viewMode='separate'; // Recovered-only view, or cards underneath native Favorites.
  let originalTitle='';
  // Only enrich the page being viewed, never the full account in the background.
  let autoTitles=true, autoTitleRequests=0;
  const attemptedTitles=new Set(), failedTitles=new Set(), scheduledTitlePages=new Set();
  const TITLE_AUTO_LIMIT=36, TITLE_BATCH=12;

  const make=(tag,txt='',cls='')=>{const el=document.createElement(tag);if(txt)el.textContent=txt;if(cls)el.className=cls;return el;};
  const button=(label,fn)=>{const el=make('button',label,'ds-full-btn');el.type='button';el.addEventListener('click',fn);return el;};
  const get=async key=>(await DS.storageGet?.([key]))?.[key];
  const save=async(key,val)=>{if(await DS.storageSet?.({[key]:val},{immediate:true})===false)throw Error('Could not save '+key);const check=await get(key);if(!check||JSON.stringify(check)!==JSON.stringify(val))throw Error('Could not verify '+key);};
  // Keep coverage metadata in small independently verified chunks. A single large
  // V1 local-storage object can fail its readback even after all searches succeed.
  const META_CHUNK=80;
  const metaKey=(slot,n)=>META_PREFIX+(slot?slot+':':'')+n;
  async function putChecked(key,value,check){
    if(await DS.storageSet?.({[key]:value},{immediate:true})===false)throw Error('Could not save '+key);
    const stored=await get(key);
    if(!check(stored,value))throw Error('Could not verify '+key);
  }
  async function readCoverage(){
    const index=await get(COVERAGE);
    if(index?.version!==2||!Array.isArray(index.ids))return index;
    const keys=Array.from({length:Math.min(500,Math.max(0,Number(index.metaChunks)||0))},(_,i)=>metaKey(index.metaSlot||'',i));
    if(!keys.length)return {...index,meta:{}};
    const parts=await DS.storageGet?.(keys)||{};
    const meta={};let loaded=0;
    for(const k of keys){
      const chunk=parts[k];
      if(!chunk||!Array.isArray(chunk.ids)||!chunk.meta)continue;
      for(const id of chunk.ids)if(chunk.meta[id]){meta[id]=chunk.meta[id];loaded++;}
    }
    return {...index,meta,metadataIncomplete:loaded!==index.ids.length};
  }
  async function saveCoverage(c){
    const ids=uniq(c.ids),chunks=Math.ceil(ids.length/META_CHUNK);
    // Alternate two slots: a partial write cannot corrupt the currently indexed snapshot.
    const previousIndex=await get(COVERAGE);
    const slot=previousIndex?.metaSlot==='a'?'b':'a';
    for(let n=0;n<chunks;n++){
      const group=ids.slice(n*META_CHUNK,(n+1)*META_CHUNK);
      const records=Object.fromEntries(group.map(id=>[id,c.meta?.[id]||{id,found:false}]));
      await putChecked(metaKey(slot,n),{ids:group,meta:records},(v)=>
        Array.isArray(v?.ids)&&v.ids.length===group.length&&group.every(id=>v?.meta?.[id]?.id===id));
    }
    const {meta:unused,metadataIncomplete:discard,...other}=c;
    const index={...other,ids,version:2,metaChunks:chunks,metaSlot:slot};
    await putChecked(COVERAGE,index,v=>v?.version===2&&v?.ids?.length===ids.length&&v?.metaChunks===chunks&&v?.metaSlot===slot&&v?.checkedAt===index.checkedAt);
  }
  // UUIDs need only 16 bytes each. This is a membership backup, NOT an export
  // of private chats or a way to change the user's SpicyChat account.
  function packIds(ids){
    const clean=uniq(ids),bytes=new Uint8Array(clean.length*16);
    for(let i=0;i<clean.length;i++){
      const hex=clean[i].replace(/-/g,'');
      for(let j=0;j<16;j++)bytes[i*16+j]=parseInt(hex.slice(2*j,2*j+2),16);
    }
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    let checksum=2166136261;
    for(const b of bytes){checksum=Math.imul(checksum^b,16777619)>>>0;}
    return {data:btoa(binary),count:clean.length,checksum:checksum.toString(16).padStart(8,'0')};
  }
  function unpackIds(snapshot){
    if(!snapshot||snapshot.encoding!=='uuid16/base64'||typeof snapshot.data!=='string')return [];
    const raw=atob(snapshot.data);if(raw.length!==snapshot.count*16)return [];
    const ids=[];
    for(let i=0;i<raw.length;i+=16){
      let h='';for(let j=0;j<16;j++)h+=raw.charCodeAt(i+j).toString(16).padStart(2,'0');
      ids.push(`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`);
    }
    const repack=packIds(ids);
    return repack.checksum===snapshot.checksum&&repack.count===snapshot.count?ids:[];
  }
  let backupBusy=false;
  async function captureIdBackup(ids,source='native-observed'){
    if(backupBusy)return false;
    backupBusy=true;
    try{
      const pack=packIds(ids),prior=await get(BACKUP);
      if(prior?.latest?.checksum===pack.checksum&&prior.latest.count===pack.count&&prior.latest.data===pack.data)return true;
      const latest={encoding:'uuid16/base64',...pack,observedAt:Date.now(),source};
      const previous=[prior?.latest,...(prior?.previous||[])].filter(x=>x?.encoding==='uuid16/base64').slice(0,2);
      const next={version:1,latest,previous};
      await putChecked(BACKUP,next,v=>v?.latest?.checksum===latest.checksum&&v?.latest?.count===ids.length&&unpackIds(v.latest).length===ids.length);
      // Only an observed change from a PREVIOUS complete snapshot can establish
      // that an ID is newly added. A first-time 2k+ snapshot establishes no dates.
      if(prior?.latest?.encoding==='uuid16/base64'){
        const oldIds=unpackIds(prior.latest);
        if(oldIds.length===prior.latest.count){
          const oldSet=new Set(oldIds),added=uniq(ids).filter(id=>!oldSet.has(id));
          if(added.length){
            try{
              const previousLog=await get(OBSERVED_ADDED);
              const at={...(previousLog?.at||{})};
              for(const id of added)at[id]=latest.observedAt;
              const log={version:1,at};
              await putChecked(OBSERVED_ADDED,log,v=>v?.version===1&&added.every(id=>v?.at?.[id]===latest.observedAt));
              observedAdditions=at;
              // The native Favorites loaded-card sorter can use the same timestamps.
              DS.state.favoriteObservedAdditions=at;
              window.dispatchEvent(new Event('ds-qol-favorites-additions-updated'));
            }catch(error){console.warn('[SpicyChat QoL] Favorite addition dates not saved:',error?.message||error);}
          }
        }
      }
      return true;
    }catch(e){console.warn('[SpicyChat QoL] Favorites ID backup not saved:',e?.message||e);return false;}
    finally{backupBusy=false;}
  }
  async function capturePassive(){
    if(!isPage()||DS.state?.settings?.enabled===false||DS.state?.settings?.passiveFavoritesIdBackup!==true)return;
    // The ordinary read path only uses SpicyChat's recently observed response.
    // No anonymous requests, no searches and no writes to SpicyChat.
    const r=await auth('read');
    if(r?.ok&&Array.isArray(r.ids))void captureIdBackup(uniq(r.ids));
  }
  async function exportIdBackup(){
    const saved=await get(BACKUP);if(!saved?.latest||unpackIds(saved.latest).length!==saved.latest.count){update('No verified Favorites ID backup saved yet. Enable passive backup and visit Favorites.');return;}
    const data={format:'spicychat-qol-favorite-ids',version:1,source:'observed SpicyChat account favorites',...saved};
    const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='spicychat-favorite-ids-'+new Date(saved.latest.observedAt).toISOString().slice(0,10)+'.json';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    update(`Exported ${saved.latest.count} saved favorite IDs (plus up to two previous snapshots). This backup does not alter SpicyChat.`);
  }

  function auth(action,id=''){
    return new Promise(resolve=>{
      if(!isPage()){resolve({ok:false,status:'not-on-favorites'});return;}
      const requestId='dsfav-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
      let done=false;
      const finish=r=>{if(done)return;done=true;clearTimeout(timer);window.removeEventListener('ds-qol-favorites-account-response-v1',receive);resolve(r);};
      const receive=e=>{if(e.detail?.requestId===requestId)finish(e.detail);};
      const timer=setTimeout(()=>finish({ok:false,status:'timeout'}),17500);
      window.addEventListener('ds-qol-favorites-account-response-v1',receive);
      window.DSCardTokenBridgeLoader?.ensure?.();
      window.dispatchEvent(new CustomEvent('ds-qol-favorites-account-request-v1',{detail:{requestId,action,id}}));
    });
  }
  async function account(fresh=false){
    let r=await auth(fresh?'read-fresh':'read');
    // A successful native settings XHR may still be in flight during page boot.
    // Wait for that bounded, same-tab observation; never poll an anonymous API.
    if (!fresh && r.status === 'native-observation-needed') {
      await new Promise(resolve=>{
        let done=false;
        const finish=()=>{if(done)return;done=true;clearTimeout(timer);window.removeEventListener('ds-qol-favorites-native-observed-v1',finish);resolve();};
        const timer=setTimeout(finish,5000);
        window.addEventListener('ds-qol-favorites-native-observed-v1',finish);
      });
      r=await auth('read');
    }
    if(!r.ok||!Array.isArray(r.ids)){
      const reason=r.status==='native-observation-needed'?'native-observation-needed':
        r.status==='verification-auth-not-ready'?'Authenticated membership verification is not available (no captured session)':
        r.status==='auth-not-ready'?'SpicyChat auth has not been observed yet. Reload Favorites once, then try again':
        r.status==='write-auth-not-ready'?'Authenticated writes are not ready on this page':(r.status||'unknown');
      throw Error('Account Favorites read failed ('+reason+(r.httpStatus?' HTTP '+r.httpStatus:'')+'). No changes made.');
    }
    return uniq(r.ids);
  }
  function query(ids){return new Promise(resolve=>{chrome.runtime.sendMessage({type:'DS_FAVORITES_RECOVERY_SEARCH',ids},r=>resolve(chrome.runtime.lastError?{ok:false,error:chrome.runtime.lastError.message}:r||{ok:false,error:'No reply'}));});}
  function imageUrl(raw){let s=text(raw);if(!s)return '';if(s.startsWith('avatars/'))s='https://cdn.nd-api.com/'+s;try{const u=new URL(s,location.origin);return u.protocol==='https:'?u.href:'';}catch{return '';}}
  const canonical=(id,m={})=>{
    const name=text(m.name||m.title||id);
    // SpicyChat stores a listing title separately from the character name.
    // Older cached coverage saved the name but discarded that title.
    const rawTitle=text(m.title||m.subtitle||'');
    const title=rawTitle && rawTitle.toLowerCase()!==name.toLowerCase()?rawTitle:'';
    const description=text(m.description||m.tagline||m.short_description||'');
    return {id,name,title,creator:text(m.creator||m.creator_username||''),description,
      image:imageUrl(m.image||m.avatar_url||m.avatarUrl||''),
      tags:Array.isArray(m.tags)?[...new Set(m.tags.map(text).filter(Boolean))].slice(0,45):[],
      visibility:text(m.visibility||''),chatUrl:`https://spicychat.ai/chat/${id}`,
      profileUrl:`https://spicychat.ai/chatbot/${id}`,isNSFW:m.isNSFW===true||m.is_nsfw===true};
  };
  const foundCount=c=>c?.ids?.filter(id=>c.meta?.[id]?.found===true).length||0;
  function update(msg){status=msg;const n=document.getElementById('ds-full-status');if(n)n.textContent=msg;}
  function showStopControl(){const n=document.getElementById('ds-favorites-full-recover');if(n)n.textContent='Stop after current request';}
  function matches(){if(!coverage)return [];
    const hist=DS.state?.favoriteBots?.meta||{},later=new Set(DS.state?.laterBots?.ids||[]),opened=DS.state?.openedChats;
    const blocked=DS.state?.blockedBotIdSet;
    const organizer=DS.state?.botOrganization?.meta||{};
    const index=new Map(coverage.ids.map((id,i)=>[id,i]));
    const currentIds=new Set(coverage.ids);
    // Recovery is not a second copy of the entire native listing. Show only
    // IDs absent from a VERIFIED native scan. Full-account records remain
    // explicitly reachable through the advanced account filter.
    const recoveryScope = viewMode==='supplement' || (filter!=='account' && filter!=='history');
    const sourceIds=filter==='history' && viewMode!=='supplement'
      ? uniq(DS.state?.favoriteBots?.ids||[]).filter(id=>!currentIds.has(id))
      : recoveryScope ? coverage.ids.filter(id=>coverage.listingVerified===true && coverage.meta?.[id]?.recovered===true)
        : coverage.ids;
    return sourceIds.map(id=>{
      const rec=coverage.meta?.[id]||{},old=hist[id]||{},m=canonical(id,{...old,...rec});
      const localOpened=DS.state?.openedChatMeta?.[id]||{};
      const confirmedChat=localOpened.hasConfirmedUserMessage===true||Number(localOpened.userMessageCount||0)>0;
      return {...m,found:rec.found===true,recovered:rec.recovered===true,inLater:later.has(id),opened:!!opened?.has?.(id),blocked:!!blocked?.has?.(id),unavailable:rec.found===false,
        historyOnly:!currentIds.has(id),
        indexedConversation:indexedBots.has(id),confirmedChat,excluded:exclusions.has(id),
        folders:Array.isArray(organizer[id]?.collections)?organizer[id].collections.map(text).filter(Boolean):[]};
    }).filter(m=>{
      const str=`${m.name} ${m.title} ${m.creator} ${m.description} ${m.id} ${m.tags.join(' ')}`.toLowerCase();
      if(search&&!str.includes(search.toLowerCase()))return false;
      if(tag&&!m.tags.some(t=>t.toLowerCase().includes(tag.toLowerCase())))return false;
      if(filter==='recovered'&&!m.recovered||filter==='later'&&!m.inLater||filter==='opened'&&!m.opened||filter==='unopened'&&m.opened||filter==='blocked'&&!m.blocked||filter==='unavailable'&&m.found||
         filter==='chatted'&&!m.confirmedChat||filter==='indexed'&&!m.indexedConversation||filter==='opened-no-chat'&&(!m.opened||m.confirmedChat)||filter==='excluded'&&!m.excluded||
         filter==='suggest'&&(!(m.inLater||m.confirmedChat||m.opened)||m.excluded))return false;
      // Local hiding applies only to the QoL view; never delete or remove underlying records.
      if(DS.state?.settings?.hideBlockedBots&&m.blocked&&filter==='all')return false;
      return true;
    }).sort((a,b)=>{
      if(sort==='creator')return a.creator.localeCompare(b.creator)||a.name.localeCompare(b.name);
      if(sort==='added-new'||sort==='added-old'){
        const av=Number(observedAdditions[a.id]||0),bv=Number(observedAdditions[b.id]||0);
        // Unknown dates belong after observed additions, not at epoch 1970.
        if(!av||!bv)return (bv?1:0)-(av?1:0)||a.name.localeCompare(b.name);
        return (sort==='added-old'?av-bv:bv-av)||a.name.localeCompare(b.name);
      }
      if(sort==='recent')return (index.get(b.id)??0)-(index.get(a.id)??0);
      return a.name.localeCompare(b.name);
    });
  }
  // Favorite History is an independent, user-maintained store. Coverage is the
  // authoritative saved scan: never rewrite its result just because a large
  // legacy history write lost a race or failed browser quota/readback.
  async function noteHistorySync(state,c,detail=''){
    try{
      const value={state,checkedAt:Number(c?.checkedAt)||0,at:Date.now(),detail:String(detail).slice(0,180)};
      await putChecked(HISTORY_STATUS,value,v=>v?.state===state&&v?.checkedAt===value.checkedAt);
    }catch(error){console.warn('[SpicyChat QoL] Favorite History sync marker not saved:',error?.message||error);}
  }
  async function recordHistory(c){
    if(!c?.ids?.length||c.partial) return false;
    const key=DS.FAVORITE_BOTS_KEY||'favoriteBots';
    const ids=uniq(c.ids);
    const freshFields=['name','title','creator','description','image','tags','visibility','isNSFW'];
    // A read-modify-write can race with Favorite History/Later UI updates. Do
    // not compare huge JSON serializations or stamp all 2k+ records anew on
    // every recovery. Verify only the records actually updated, retrying with
    // the latest stored history if an intervening write changed it.
    for(let attempt=0;attempt<3;attempt++){
      const old=await get(key)||DS.state?.favoriteBots||{ids:[],meta:{}};
      const oldIds=Array.isArray(old.ids)?old.ids:[];
      const savedIds=new Set(oldIds);
      const additions=ids.filter(id=>!savedIds.has(id));
      const changes={}, changedFields={};
      for(const id of ids){
        const prior=old.meta?.[id]||{},current=c.meta?.[id]||{};
        const update={};
        if(current.found===true){
          for(const field of freshFields){
            const value=current[field];
            if(!((Array.isArray(value)&&value.length)||(!Array.isArray(value)&&value)))continue;
            // Do not overwrite unrelated personal QoL fields or write exact
            // duplicates just to refresh an account-membership timestamp.
            if(JSON.stringify(prior[field])!==JSON.stringify(value))update[field]=value;
          }
        }
        if(prior.id!==id)update.id=id;
        if(prior.profileUrl==null)update.profileUrl=`https://spicychat.ai/chatbot/${id}`;
        if(prior.chatUrl==null)update.chatUrl=`https://spicychat.ai/chat/${id}`;
        if(prior.favoriteMembership!=='current'||prior.removedAt||prior.removedReason){
          update.favoriteMembership='current';
          update.lastConfirmedFavoriteAt=c.checkedAt;
          update.removedAt=0;
          update.removedReason='';
        }
        if(Object.keys(update).length){changes[id]={...prior,...update};changedFields[id]=Object.keys(update);}
      }
      if(!additions.length&&!Object.keys(changes).length){
        DS.state.favoriteBots=old;
        historySyncPending=false;
        await noteHistorySync('complete',c);
        return true;
      }
      const next={...old,ids:[...oldIds,...additions],meta:{...(old.meta||{}),...changes}};
      const ok=await DS.storageSet?.({[key]:next},{immediate:true});
      if(ok!==false){
        const check=await get(key);
        const checkIds=new Set(check?.ids||[]);
        const verified=!!check&&additions.every(id=>checkIds.has(id))&&Object.entries(changes).every(([id,entry])=>{
          const saved=check.meta?.[id];
          if(!saved)return false;
          return (changedFields[id]||[]).every(field=>JSON.stringify(saved[field])===JSON.stringify(entry[field]));
        });
        if(verified){
          DS.state.favoriteBots=check;
          DS.refreshFastLookupCaches?.();
          historySyncPending=false;
          await noteHistorySync('complete',c);
          return true;
        }
      }
      if(attempt<2)await sleep(200*(attempt+1));
    }
    historySyncPending=true;
    await noteHistorySync('pending',c,'Full Favorite History store did not verify; coverage and ID snapshots are preserved.');
    return false;
  }
  async function retryHistorySync(){
    if(busy||!coverage||!enabled())return;
    busy=true;update('Syncing Favorite History from saved recovery (no account or search requests)…');
    try{
      const ok=await recordHistory(coverage);
      update(ok?'Favorite History synchronized from saved recovery. No network requests made.':
        'Favorite History sync is still pending. Saved recovery data is safe; try again later. No network requests made.');
    }catch(error){
      historySyncPending=true;
      await noteHistorySync('pending',coverage,error?.message||String(error));
      update('Favorite History sync pending: '+String(error?.message||error)+'. Saved recovery is unaffected.');
    }finally{busy=false;render();}
  }
  async function refreshCoverage(forceAll=false,fromNativeReload=false){
    if(busy||!enabled())return;
    if(!fromNativeReload && !confirm('Read current account favorite IDs and check missing bots in small read-only searches? No Favorites will change.'))return;
    nativeRefreshNeeded=false;
    busy=true;stop=false;render();let partial=null;
    try{
      update('Reading current account favorites…');const ids=await account(),accountSet=new Set(ids);
      await captureIdBackup(ids,'manual-recovery');
      const scan=await get(SCAN),previous=await readCoverage()||{};
      const liveListing=scan?.listingVerified===true&&Array.isArray(scan.ids)&&scan.ids.length>0;
      const savedListing=previous?.listingVerified===true&&Array.isArray(previous.listingIds)&&previous.listingIds.length>0;
      // No guessed 'recovered' flag when the native list has not been scanned.
      // An older complete listing may be reused, but its age stays visible.
      const listingSource=liveListing?scan.ids:(savedListing?previous.listingIds:[]);
      const listing=uniq(listingSource).filter(x=>accountSet.has(x));
      const listingVerified=!!(liveListing||savedListing),listingSet=new Set(listing);
      if(!listingVerified)throw Error('Scan native Favorites through its last page first. A verified listing is needed to identify the bots missing from it.');
      const meta={};const history=DS.state.favoriteBots?.meta||{};
      for(const id of ids){
        const prior=previous.meta?.[id];const remembered=history[id]||{};
        meta[id]={...canonical(id,{...remembered,...(prior?.found?prior:{})}),found:listingSet.has(id)||prior?.found===true,
          recovered:!listingSet.has(id),source:'account',checkedAt:prior?.checkedAt||0};
      }
      // Re-query only the omitted IDs, and never re-query thousands of native
      // listing entries as a fallback for a missing coverage baseline.
      const queryIds=ids.filter(id=>!listingSet.has(id)&&(forceAll||!meta[id].found||!meta[id].checkedAt));
      const maxRequests=Math.ceil(queryIds.length/40);
      partial={version:1,checkedAt:Date.now(),ids,listingIds:listing,listingCount:listing.length,listingVerified:true,
        listingCheckedAt:liveListing?scan.lastCompleteAt:previous.listingCheckedAt||previous.checkedAt,
        nativeResultCount:Number((liveListing?scan.listingCount:previous.nativeResultCount)||0),accountCount:ids.length,meta,
        batchesDone:0,batchesTotal:maxRequests,partial:true};
      for(let start=0;start<queryIds.length;start+=40){
        if(stop||!enabled())break;
        const group=queryIds.slice(start,start+40);
        const r=await query(group);if(!r?.ok)throw Error('Search batch '+(1+start/40)+' failed: '+(r?.error||'unknown'));
        const found=new Set();for(const b of r.bots||[]){if(!accountSet.has(b.id))continue;found.add(b.id);const prior=meta[b.id];
          meta[b.id]={...prior,...canonical(b.id,{...prior,...b}),found:true,recovered:!listing.includes(b.id),checkedAt:Date.now()};}
        for(const id of group)if(!found.has(id)){meta[id].found=false;meta[id].checkedAt=Date.now();}
        partial.batchesDone++;update(`Account ${ids.length} · Listing ${listing.length} · Indexed ${foundCount(partial)} · ${partial.batchesDone}/${maxRequests} searches · ${stop?'stopping':'running'}`);
        if(start+40<queryIds.length)await sleep(300);
      }
      partial.partial=stop||partial.batchesDone<maxRequests;partial.checkedAt=Date.now();
      coverage=partial;await saveCoverage(partial);
      let historyIssue='';
      if(!partial.partial){
        try{
          const synced=await recordHistory(coverage);
          if(!synced)historyIssue=' · Favorite History sync pending (recovery saved; retry without rescanning)';
        }catch(error){
          historySyncPending=true;
          await noteHistorySync('pending',coverage,error?.message||String(error));
          historyIssue=' · Favorite History sync pending (recovery saved; retry without rescanning)';
          console.warn('[SpicyChat QoL] Favorite History sync deferred:',error?.message||error);
        }
      }
      update(`Account ${ids.length} · Native listing ${listing.length||'not scanned'} · Recovered ${ids.filter(id=>!listing.includes(id)&&meta[id].found).length} · Unavailable/unindexed ${ids.filter(id=>meta[id].found===false).length}${partial.partial?' · Incomplete, run recovery again':''}${historyIssue}.`);
    }catch(e){
      if(partial?.batchesDone){coverage=partial;try{partial.partial=true;await saveCoverage(partial);}catch{}}
      nativeRefreshNeeded=/native-observation-needed|http HTTP 403/i.test(String(e?.message||''));
      update(nativeRefreshNeeded
        ? 'SpicyChat did not provide a usable native account snapshot on this page. Use “Reload once & scan” to capture its own authenticated settings response. No changes made.'
        : partial?.batchesDone ? `Recovery search finished ${partial.batchesDone}/${partial.batchesTotal} batches; results kept in this tab but storage needs attention: ${e.message}. Favorites ID backup is separate.` : `Recovery stopped: ${e.message}`);
    }
    finally{busy=false;stop=false;render();}
  }
  // Search misses are not proof of deletion. Recheck only unresolved account IDs,
  // using a freshly observed native account snapshot and small, read-only batches.
  // Preserve the old history and never infer an unfavorite from Typesense alone.
  async function recheckUnresolved(){
    if(busy||!coverage||!enabled()||!active)return;
    const oldIds=uniq(coverage.ids);
    const unresolved=oldIds.filter(id=>coverage.meta?.[id]?.recovered===true&&coverage.meta?.[id]?.found===false);
    if(!unresolved.length){update('No unresolved recovered bot IDs to recheck.');return;}
    if(!confirm(`Recheck ${unresolved.length} account Favorites missing from the search results? This uses SpicyChat's last observed account settings response. Reload Favorites first if you changed favorites on another device. No favorites will change.`))return;
    busy=true;stop=false;showStopControl();
    let checked=0,found=0,notIndexed=0;
    try{
      update('Checking SpicyChat’s last observed account Favorites membership…');
      const current=await account();
      const currentSet=new Set(current),oldSet=new Set(oldIds);
      const newIds=current.filter(id=>!oldSet.has(id));
      const gone=unresolved.filter(id=>!currentSet.has(id));
      const remaining=unresolved.filter(id=>currentSet.has(id));
      // Only reconcile removals when there are no new IDs needing native-listing
      // verification. Never wipe an existing scan's recovery classification.
      if(!newIds.length&&current.length!==oldIds.length){
        coverage.ids=current;
        coverage.accountCount=current.length;
        coverage.listingIds=(coverage.listingIds||[]).filter(id=>currentSet.has(id));
        coverage.listingCount=coverage.listingIds.length;
        coverage.membershipCheckedAt=Date.now();
      }
      for(let start=0;start<remaining.length;start+=40){
        if(stop||!active||!enabled()||document.visibilityState==='hidden')break;
        const group=remaining.slice(start,start+40);
        const res=await query(group);
        if(!res?.ok)throw Error('Search failed: '+(res?.error||'unknown'));
        const returned=new Set();
        for(const bot of res.bots||[]){
          const id=String(bot?.id||'').toLowerCase();
          if(!group.includes(id))continue;
          returned.add(id);
          const prior=coverage.meta[id]||{};
          coverage.meta[id]={...prior,...canonical(id,{...prior,...bot}),found:true,recovered:true,checkedAt:Date.now()};
          found++;
        }
        for(const id of group){
          if(returned.has(id))continue;
          const prior=coverage.meta[id]||{};
          coverage.meta[id]={...prior,found:false,recovered:true,checkedAt:Date.now()};
          notIndexed++;
        }
        checked+=group.length;
        update(`Rechecked ${checked}/${remaining.length} unresolved IDs · ${found} now found · ${notIndexed} still not returned.`);
        if(start+40<remaining.length)await sleep(400);
      }
      coverage.metadataUpdatedAt=Date.now();
      if(!stop){
        await saveCoverage(coverage);
        update(`${found} now found · ${notIndexed} still not returned by search · ${gone.length} no longer in the observed account list${newIds.length?' · '+newIds.length+' newly favorited bots require a full scan':''}. Favorite History retained.`);
      }else update('Unresolved recheck stopped; partial changes retained in this tab, no account writes made.');
    }catch(error){update('Unresolved recheck stopped: '+String(error?.message||error)+'. No account favorites changed.');}
    finally{busy=false;stop=false;render();}
  }
  // A recovered Typesense result can contain only its name, creator and tags.
  // Repeating the same Typesense search will not invent a missing public title.
  // Explicitly enrich a small on-screen batch via the existing public profile
  // reader; keep auth, request throttling and error handling in that shared helper.
  async function loadVisibleTitles(automatic=false,retryFailed=false){
    if(busy||!coverage||!enabled()||!active)return;
    if(automatic && (!autoTitles||document.visibilityState==='hidden'||autoTitleRequests>=TITLE_AUTO_LIMIT||viewMode!=='separate'))return;
    const reader=DS.fetchPublicCharacterFieldsDetailed;
    if(typeof reader!=='function'){
      update('The shared public bot details reader is unavailable on this tab. No metadata was changed.');return;
    }
    const visible=matches().slice((page-1)*48,page*48);
    const target=visible.filter(m=>m.found && !m.title && (retryFailed?failedTitles.has(m.id):!attemptedTitles.has(m.id)))
      .slice(0,automatic?Math.min(TITLE_BATCH,TITLE_AUTO_LIMIT-autoTitleRequests):TITLE_BATCH);
    if(!target.length){if(!automatic)update(retryFailed?'No previously failed public titles on this page.':'No untried missing public titles on this page. Use Retry failed titles if needed.');return;}
    // Do not destroy and recreate 48 picture cards before making network reads.
    busy=true;stop=false;showStopControl();
    let checked=0,filled=0,unavailable=0,failed=0,consecutiveFailures=0;
    try{
      for(const item of target){
        if(stop||!active||!enabled()||document.visibilityState==='hidden')break;
        update(`Reading public titles ${checked+1}/${target.length}: ${item.name}…`);
        attemptedTitles.add(item.id);
        if(automatic)autoTitleRequests++;
        let result=null;
        try{result=await reader(item.id);}catch(error){result={ok:false,status:String(error?.message||error)};}
        checked++;
        if(result?.ok && result.fields && typeof result.fields==='object'){
          failedTitles.delete(item.id);consecutiveFailures=0;
          const prior=coverage.meta[item.id]||{};
          const fields=result.fields;
          // Never use the name itself as a second subtitle. Do not overwrite
          // existing private/QoL-specific metadata with empty API fields.
          const raw=text(fields.title||fields.description||'');
          const title=raw && raw.toLowerCase()!==text(prior.name||item.name).toLowerCase()?raw:'';
          const description=text(fields.description||'');
          if(title||description){
            coverage.meta[item.id]={...prior,...(title?{title}:{}),...(description?{description}:{})};
            filled++;
          }else unavailable++;
        }else{
          failedTitles.add(item.id);failed++;consecutiveFailures++;
          if(result?.status==='rate-limited'||result?.httpStatus===429){
            update('Public profile lookups were rate-limited. Stopped without discarding saved metadata.');
            break;
          }
          if(result?.status==='auth-unavailable'||result?.status==='api-bridge-not-ready'||[401,403].includes(Number(result?.httpStatus||0))){
            update('Public profile authentication is unavailable. Stopped without discarding saved metadata.');
            break;
          }
          if(consecutiveFailures>=2 && ![404,410].includes(Number(result?.httpStatus||0))){
            update('Public profile lookups failed twice consecutively. Stopped to avoid repeated rejected requests.');
            break;
          }
        }
        if(checked<target.length)await sleep(450);
      }
      if(filled){
        // Updating public card text is NOT a fresh account-membership scan.
        coverage.metadataUpdatedAt=Date.now();
        await saveCoverage(coverage);
      }
      update(`Public titles: ${filled} enriched, ${unavailable} not provided, ${failed} unavailable/failed (${checked}/${target.length} checked). ${stop?'Stopped.':'Use Load next 12 missing titles for more.'}`);
    }catch(error){
      update(`Title enrichment stopped: ${error?.message||error}. Existing recovered data was kept; ${filled} refreshed in this tab.`);
    }finally{busy=false;stop=false;render();}
  }

  async function saveLater(ids){
    const key=DS.LATER_BOTS_KEY||'laterBots',old=await get(key)||DS.state.laterBots||{ids:[],meta:{}};
    const next={ids:[...new Set([...(old.ids||[]),...ids])],meta:{...(old.meta||{})}};
    for(const id of ids){const m=canonical(id,{...(DS.state?.favoriteBots?.meta?.[id]||{}),...(coverage?.meta?.[id]||{})});const o=next.meta[m.id]||{};
      next.meta[m.id]={...canonical(m.id,{...m,...o}),...o,id:m.id,savedAt:o.savedAt||Date.now(),
        name:o.name||m.name,title:o.title||m.title,creator:o.creator||m.creator,description:o.description||m.description,
        image:o.image||m.image,tags:o.tags?.length?o.tags:m.tags};}
    await save(key,next);if(ids.some(id=>!next.ids.includes(id)))throw Error('Later verification failed');
    DS.state.laterBots=next;DS.refreshFastLookupCaches?.();DS.updateLaterBotButtons?.();
  }
  async function prepare(kind){
    if(busy)return;
    const allowed=new Set(matches().map(bot=>bot.id));
    const allSelected=uniq([...selected]);
    if(allSelected.some(id=>!allowed.has(id))){update('Selection changed with the filters. Review the visible bots again before continuing.');selected.clear();render();return;}
    const current=new Set(coverage?.ids||[]);
    const history=new Set(DS.state?.favoriteBots?.ids||[]);
    const ids=allSelected.filter(id=>kind==='later'?(current.has(id)||history.has(id)):current.has(id));
    if(ids.length!==allSelected.length&&kind!=='later'){update('Selected Favorite History-only bots cannot be unfavorited; select current account favorites instead.');return;}
    if(!ids.length){update('Select relevant favorites first.');return;}
    if(kind==='later'){
      if(!confirm(`Save ${ids.length} selected bots to Later? Favorite History-only bots are copied safely, without claiming they are still favorited.`))return;
      busy=true;try{await saveLater(ids);update(`Verified ${ids.length} bots saved to Later.`);}catch(e){update(e.message);}finally{busy=false;render();}return;
    }
    if(await get(QUEUE)){update('An existing Favorites cleanup queue is still saved. Finish or dismiss it first.');return;}
    if(!confirm(`${kind==='move'?'Save to Later, verify, then unfavorite':'Unfavorite'} ${ids.length} selected current Favorites? You must separately confirm before starting the write queue. Favorite History will remain intact.`))return;
    busy=true;try{
      if(kind==='move')await saveLater(ids);
      const job={version:1,mode:'api',ids,confirmed:[],pending:[],skipped:[],requireLater:kind==='move',createdAt:Date.now(),updatedAt:Date.now()};
      await save(QUEUE,job);cleanupQueue=job;update(`Prepared ${ids.length} account-verified removals. Start the cleanup queue to apply changes.`);
    }catch(e){update('No cleanup queued: '+e.message);}finally{busy=false;render();}
  }
  async function confirmFormer(id){
    const key=DS.FAVORITE_BOTS_KEY||'favoriteBots',old=await get(key)||DS.state.favoriteBots||{ids:[],meta:{}};
    const next={ids:[...new Set([...(old.ids||[]),id])],meta:{...(old.meta||{})}};
    next.meta[id]={...(next.meta[id]||{}),id,favoriteMembership:'former',removedAt:Date.now(),removedReason:'account-verified-unfavorite'};
    await save(key,next);DS.state.favoriteBots=next;
  }
  DS.stopFavoriteApiCleanupJob=()=>{stop=true;update('Stopping after current verification…');};
  DS.runFavoriteApiCleanupJob=async job=>{
    if(busy||!enabled()||!job||job.mode!=='api')return;
    const queued=await get(QUEUE);if(!queued||queued.createdAt!==job.createdAt)return;
    const pending=uniq(job.ids).filter(id=>!job.confirmed.includes(id)&&!job.skipped.includes(id));
    if(!pending.length){update('No unattempted removals. Retry failures or dismiss the finished queue.');return;}
    if(!confirm(`Unfavorite ${pending.length} selected bots using SpicyChat's observed PATCH /v2/users/settings? Every removal will be verified against a fresh GET /users/settings. Stop is available between requests.`))return;
    busy=true;stop=false;render();
    try{
      for(const id of pending){
        if(stop||!enabled()||document.visibilityState==='hidden')break;
        const latest=await get(QUEUE);if(!latest||latest.createdAt!==job.createdAt)throw Error('Cleanup queue changed.');cleanupQueue=latest;
        if(latest.confirmed.includes(id)||latest.skipped.includes(id))continue;
        const before=await account(true);
        if(!before.includes(id)){
          latest.confirmed=uniq([...latest.confirmed,id]);latest.pending=(latest.pending||[]).filter(x=>x!==id);
          latest.updatedAt=Date.now();await save(QUEUE,latest);await confirmFormer(id);selected.delete(id);continue;
        }
        if(latest.requireLater){const saved=await get(DS.LATER_BOTS_KEY||'laterBots');if(!saved?.ids?.includes(id))throw Error('Bot '+id+' is no longer in verified Later storage.');}
        // Mark pending BEFORE the write; an interrupted readback must never issue a duplicate write blindly.
        latest.pending=uniq([...(latest.pending||[]),id]);latest.updatedAt=Date.now();await save(QUEUE,latest);
        update(`Unfavoriting ${latest.confirmed.length}/${latest.ids.length} · verification in progress`);
        const response=await auth('unfavorite',id);
        if(!response.ok && response.status==='write-auth-not-ready'){
          update('Unfavorite unavailable: browser has not exposed a verified write credential. Queue kept; no PATCH sent.');
          throw Error('authenticated write not ready');
        }
        // Fresh authoritative membership, even after an uncertain write result.
        const after=await account(true);
        if(!after.includes(id)){
          latest.confirmed=uniq([...latest.confirmed,id]);latest.pending=latest.pending.filter(x=>x!==id);
          await confirmFormer(id);selected.delete(id);if(coverage){coverage.ids=coverage.ids.filter(x=>x!==id);coverage.accountCount=coverage.ids.length;await saveCoverage(coverage);}
        }else{
          latest.pending=latest.pending.filter(x=>x!==id);latest.skipped=uniq([...(latest.skipped||[]),id]);
          update(`Removal not verified for ${id}: ${response?.status||'still favorited'}.`);
        }
        latest.updatedAt=Date.now();await save(QUEUE,latest);cleanupQueue=latest;await sleep(500);
      }
      update(stop?'Cleanup stopped. Resume from the saved queue.':'Cleanup pass finished. Check failures before dismissing.');
    }catch(e){update('Cleanup paused safely: '+e.message+' · Pending write is NOT retried automatically.');}
    finally{busy=false;stop=false;cleanupQueue=await get(QUEUE).catch(()=>cleanupQueue);render();}
  };
  function css(){if(document.getElementById(STYLE))return;
    const st=make('style');st.id=STYLE;st.textContent=`
      /* Keep SpicyChat's real tab bar visible, even in QoL's separate view.
         Never hide native results unless the replacement panel is attached and visible. */
      html[data-ds-full-favorites-active="1"]:has(#${PANEL}:not([hidden])) [data-ds-favorites-native-controls="1"],
      html[data-ds-full-favorites-active="1"]:has(#${PANEL}:not([hidden])) [data-ds-favorites-native-results="1"]{display:none!important}
      html[data-ds-full-favorites-active="1"]:has(#${PANEL}:not([hidden])) .ds-later-native-pagination{display:none!important}
      #${PANEL}{padding:12px 0 40px;color:inherit} #${PANEL}[hidden]{display:none!important}
      #${PANEL} *{box-sizing:border-box}#${PANEL} .ds-full-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
      #${PANEL} input,#${PANEL} select,#${PANEL} .ds-full-btn{font:12px system-ui;padding:8px;border:1px solid #575b66;border-radius:7px;background:#22242a;color:inherit}
      #${PANEL} .ds-full-btn{cursor:pointer}#${PANEL} .ds-full-btn:disabled{opacity:.45;cursor:default}
      #${PANEL} .ds-full-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(182px,1fr));gap:12px}
      #${PANEL} .ds-full-card{min-width:0;background:#171719;border:1px solid #343438;border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
      #${PANEL} .ds-full-card img{display:block;aspect-ratio:1/1;width:100%;object-fit:cover}
      #${PANEL} .ds-full-card-main{padding:10px;display:flex;flex-direction:column;flex:1;gap:6px;overflow-wrap:anywhere}
      /* The hook/title is the primary card copy. Never truncate it to make
         room for tag pills; the tags and actions follow the full title. */
      #${PANEL} .ds-full-card-subtitle{font-size:12px;line-height:1.4;font-weight:500;margin:1px 0 0;opacity:.92;display:block;white-space:normal;overflow-wrap:anywhere;overflow:visible;max-height:none;-webkit-line-clamp:unset}
      #${PANEL} .ds-full-card-description{font-size:11px;line-height:1.4;margin:0;opacity:.78;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      #${PANEL} .ds-full-tags{display:flex;gap:3px;flex-wrap:wrap;align-items:flex-start}
      #${PANEL} .ds-full-tags span{border:1px solid #52545a;border-radius:3px;padding:1px 3px;font-size:9px;line-height:1.35;font-weight:400;max-width:100%;overflow-wrap:anywhere}
      #${PANEL} .ds-full-card-actions{margin-top:auto;display:flex;gap:5px;flex-wrap:wrap;align-items:center}
      #${PANEL} .ds-full-opened{display:inline-flex;align-items:center;padding:2px 4px;border:1px solid #52545a;border-radius:3px;font-size:9px;line-height:1.2;opacity:.7;white-space:nowrap}
      #${PANEL} .ds-full-card a{color:inherit;text-decoration:none}#${PANEL} .ds-full-card a:hover{text-decoration:underline}
      #${PANEL} .ds-full-card-actions a,#${PANEL} .ds-full-card-actions button{padding:4px 6px;border:1px solid #555;border-radius:6px;background:transparent;color:inherit;font-size:12px;cursor:pointer}
      #${PANEL} .ds-full-pager{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:22px}
      #${PANEL} [data-current="1"]{border-color:#438af2;background:#163c73}
      #${PANEL} .ds-full-advanced{border:1px solid #343438;border-radius:8px;padding:8px 11px;margin:0 0 14px;color:inherit;font-size:12px}
      #${PANEL} .ds-full-advanced summary{cursor:pointer;opacity:.82}
      #${TAB}{padding:0 10px;white-space:nowrap}
      [data-testid="SearchClientCharacterListing"] [role="tablist"]:has(#${TAB}){max-width:100%;min-width:0;flex-wrap:wrap;overflow:visible;height:auto;row-gap:3px}
      [data-testid="SearchClientCharacterListing"] [role="tablist"]:has(#${TAB}) + [data-testid="AppliedFiltersBarView"]{flex-shrink:0;min-width:140px}
      #${PANEL} .ds-full-tools > span{line-height:1.4;flex:1 1 250px}

    `;document.head.append(st);
  }
  function pagerHost(native){
    // The native paginator is React-owned, but a sibling of the native listing.
    for(const sib of [...native.parentElement.children]){
      if(sib===native||sib.id===PANEL||sib.dataset?.dsLaterNativePager==='1')continue;
      if(sib.querySelector?.('.ds-pagination-qol-layout') || (sib.classList.contains('justify-center')&&sib.querySelectorAll('button').length>=2)){
        sib.classList.add('ds-later-native-pagination');
      }
    }
  }
  function render(){
    const el=document.getElementById(PANEL);if(!el||!active||!enabled())return;
    lastRenderedLater=DS.state?.laterBots;lastRenderedHistory=DS.state?.favoriteBots;
    el.replaceChildren();
    const head=make('div');head.className='ds-full-tools';const h=make('h2','Recovered Favorites (QoL)');h.style.cssText='font-size:23px;margin:0 auto 0 0';
    // State labels looked like action labels. Make the next action explicit:
    // clicking this button must never masquerade as a navigation back to native.
    const changeMode=button(viewMode==='supplement'?'Show Recovered only':'Show with native Favorites',()=>{
      viewMode=viewMode==='supplement'?'separate':'supplement';selected.clear();
      applyMode();render();
      // In "with native" mode, 48+ native cards come before this QoL panel.
      // Keep the view controls visible instead of apparently losing the panel.
      document.getElementById(PANEL)?.scrollIntoView({block:'start',behavior:'instant'});
    });
    changeMode.title=viewMode==='supplement'?'Hide native Favorites cards again':'Show recovered cards beneath native Favorites cards';
    // A real link remains usable if the extension's handler ever fails.
    const back=make('a','Back to Favorites','ds-full-btn');
    back.href='/favorite-bots';back.style.textDecoration='none';
    back.addEventListener('click',e=>{
      if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
      e.preventDefault();setActive(false);
      document.querySelector('[data-testid="SearchClientCharacterListing"] [role="tablist"]')?.scrollIntoView({block:'start',behavior:'instant'});
    });
    head.append(h,changeMode,back);el.append(head);
    const toolbar=make('div');toolbar.className='ds-full-tools';
    const recover=button(busy?'Stop after current request':'Scan / recover favorites',()=>{if(busy){stop=true;update('Stopping after current request…');}else void refreshCoverage();});recover.id='ds-favorites-full-recover';toolbar.append(recover);
    const all=button('Refresh missing metadata',()=>void refreshCoverage(true));all.disabled=busy||!coverage;
    const more=make('details');more.className='ds-full-advanced';more.append(make('summary','Backup & advanced tools'));
    const extra=make('div');extra.className='ds-full-tools';
    const missingCount=coverage?.ids?.filter(id=>coverage.meta?.[id]?.recovered===true&&coverage.meta?.[id]?.found===false).length||0;
    if(missingCount){const recheck=button(`Recheck unresolved (${missingCount})`,()=>void recheckUnresolved());recheck.disabled=busy;extra.append(recheck);}
    extra.append(button('Export saved Favorites IDs',()=>void exportIdBackup()));
    more.append(extra);
    if(nativeRefreshNeeded&&!busy){extra.append(button('Reload once & scan',()=>{
      if(!confirm('Reload this Favorites page once to capture SpicyChat’s own authenticated account settings response, then resume the read-only recovery scan?'))return;
      try{sessionStorage.setItem(RESUME_NATIVE, '1');location.reload();}
      catch{update('Could not request reload. Reload Favorites manually and press Scan again.');}
    }));}
    extra.append(all);
    if(historySyncPending&&coverage&&!coverage.partial){
      const retryHistory=button('Retry Favorite History sync (no scan)',()=>void retryHistorySync());
      retryHistory.disabled=busy;
      extra.append(retryHistory);
    }
    const enrich=button('Load next 12 missing titles',()=>void loadVisibleTitles());
    enrich.disabled=busy||!coverage;
    extra.append(enrich);
    if(failedTitles.size){const retry=button(`Retry failed public titles (${failedTitles.size})`,()=>void loadVisibleTitles(false,true));retry.disabled=busy;extra.append(retry);}
    const autoLabel=make('label');autoLabel.style.cssText='display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer';
    const autoCheck=make('input');autoCheck.type='checkbox';autoCheck.checked=autoTitles;
    autoCheck.addEventListener('change',async()=>{autoTitles=autoCheck.checked;
      try{await DS.storageSet?.({[AUTO_TITLES]:autoTitles},{immediate:true});}catch{}
      // Re-enable one bounded pass when a user switches it on deliberately.
      if(autoTitles){scheduledTitlePages.clear();render();}
    });
    autoLabel.append(autoCheck,make('span','Load up to 12 missing titles on each Recovered page'));extra.append(autoLabel);
    const summary=make('span',coverage?`Native listing ${coverage.listingVerified?coverage.listingCount:'unverified'} · Found outside listing ${coverage.ids.filter(id=>coverage.meta[id]?.recovered&&coverage.meta[id]?.found).length} · Not returned by search ${coverage.ids.filter(id=>coverage.meta[id]?.recovered&&coverage.meta[id]?.found===false).length} · Account ${coverage.ids.length}${coverage.partial?' · partial scan':''}`:'Scan to find bots missing from native Favorites');toolbar.append(summary);el.append(toolbar,more);
    const stat=make('p',status);stat.id='ds-full-status';stat.style.opacity='.8';el.append(stat);
    if(!coverage)return;
    if(coverage.listingVerified!==true){el.append(make('p','Native listing has not been fully verified yet. Run Scan Favorites first so QoL does not accidentally label every account favorite as recovered.'));return;}
    const controls=make('div');controls.className='ds-full-tools';
    const field=(kind,value,placeholder,cb)=>{const x=make(kind);if(kind==='input'){x.type='search';x.placeholder=placeholder;x.value=value;x.style.minWidth='170px';x.addEventListener('input',()=>{
          cb(x.value);selected.clear();page=1;
          // Rebuilding all cards on every keystroke repeatedly decodes images
          // and stalls longer lists. Keep the input alive until typing settles.
          clearTimeout(filterRenderTimer);
          const cursor=x.selectionStart;
          filterRenderTimer=setTimeout(()=>{
            if(!active||!enabled()||!el.isConnected)return;
            render();
            const again=[...el.querySelectorAll('input')].find(input=>input.placeholder===placeholder);
            if(again){again.focus({preventScroll:true});try{again.setSelectionRange(cursor,cursor);}catch{}}
          },220);
        });}else {for(const [v,label] of placeholder){const o=make('option',label);o.value=v;x.append(o);}x.value=value;x.addEventListener('change',()=>{cb(x.value);selected.clear();page=1;render();});}controls.append(x);return x;};
    field('input',search,'Search recovered favorites',v=>search=v);
    field('input',tag,'Filter by tag',v=>tag=v);
    field('select',filter,[['all','Recovered favorites'],['recovered','Recovered only'],['account','All account favorites (advanced)'],['later','Already in Later'],['chatted','Confirmed chatted'],['indexed','Conversation indexed (availability unverified)'],['opened-no-chat','Opened without confirmed chat'],['opened','Opened (not necessarily chatted)'],['unopened','Not opened'],['blocked','Blocked'],['unavailable','Not returned by search'],['history','Favorite History only (not current)'],['excluded','Excluded from suggestions'],['suggest','Cleanup candidates']],v=>filter=v);
    field('select',sort,[['name','Name A-Z'],['creator','Creator'],
      ['added-new','Recently added to Favorites (observed)'],['added-old','Oldest observed additions'],
      ['recent','Reverse account order (not a date)']],v=>sort=v);
    if(sort==='added-new'||sort==='added-old'){
      const note=make('small',`QoL has observed ${coverage.ids.filter(id=>Number(observedAdditions[id])>0).length} actual addition(s) since tracking started. Older favorite dates are unknown.`);
      note.style.opacity='.75';note.style.flexBasis='100%';controls.append(note);
    }
    el.append(controls);
    const result=matches(),count=Math.max(1,Math.ceil(result.length/48));page=Math.min(page,count);
    const shown=result.slice((page-1)*48,page*48);
    const actions=make('div');actions.className='ds-full-tools';
    actions.append(button(`Select page (${shown.length})`,()=>{shown.forEach(m=>selected.add(m.id));render();}),button('Clear selection',()=>{selected.clear();render();}));
    const limit=make('select');for(const n of [100,300,500]){const o=make('option',`Review ${n} bots`);o.value=n;limit.append(o);}limit.value=String(target);limit.addEventListener('change',()=>{target=+limit.value;});actions.append(limit);
    actions.append(button('Select suggested up to target',()=>{
      const all=matches().filter(m=>!m.excluded),seen=new Set();
      const candidates=[...all.filter(m=>m.inLater),...all.filter(m=>m.confirmedChat),...all.filter(m=>m.opened&&!m.confirmedChat)]
        .filter(m=>{if(seen.has(m.id))return false;seen.add(m.id);return true;});
      candidates.slice(0,target).forEach(m=>selected.add(m.id));render();
    }));
    actions.append(button('Exclude selected from suggestions',async()=>{
      for(const id of selected)exclusions.add(id);await DS.storageSet?.({[EXCLUSIONS]:[...exclusions]},{immediate:true});selected.clear();render();
    }));
    actions.append(button('Include selected again',async()=>{
      for(const id of selected)exclusions.delete(id);await DS.storageSet?.({[EXCLUSIONS]:[...exclusions]},{immediate:true});selected.clear();render();
    }));
    actions.append(button('Export selected history JSON',()=>{
      const ids=uniq([...selected]);if(!ids.length){update('Select some bots first.');return;}
      const payload={format:'dsq-favorite-history-recovery',version:1,exportedAt:new Date().toISOString(),
        bots:ids.map(id=>({id,wasLoaded:false,...(DS.state?.favoriteBots?.meta?.[id]||coverage?.meta?.[id]||{})}))};
      DS.downloadTextFile?.(JSON.stringify(payload,null,2),`favorites-recovery-${Date.now()}.json`,'application/json;charset=utf-8',{requestPermission:true});
    }));
    actions.append(button(`Add to Later (${selected.size})`,()=>void prepare('later')),
      button('Unfavorite selected',()=>void prepare('unfavorite')),
      button('Move to Later + Unfavorite',()=>void prepare('move')));
    if(cleanupQueue?.mode==='api'&&cleanupQueue.ids?.length){
      const job=cleanupQueue;
      const verified=job.confirmed?.length||0,failed=job.skipped?.length||0,pending=job.pending?.length||0;
      const remaining=job.ids.filter(id=>!job.confirmed.includes(id)&&!job.skipped.includes(id)).length;
      const statusText=make('span',`Cleanup queue: ${verified}/${job.ids.length} verified, ${failed} failed, ${pending} uncertain, ${remaining} to check.`);
      actions.append(statusText);
      const start=button(busy?'Stop cleanup after current bot':`Run queued removals (${remaining})`,()=>{
        if(busy){DS.stopFavoriteApiCleanupJob?.();return;}
        void DS.runFavoriteApiCleanupJob?.(job);
      });start.disabled=!busy&&!remaining;actions.append(start);
      if(!busy&&failed)actions.append(button('Retry failed',async()=>{
        const latest=await get(QUEUE);if(!latest||latest.createdAt!==job.createdAt)return;
        latest.skipped=[];latest.updatedAt=Date.now();await save(QUEUE,latest);cleanupQueue=latest;render();
      }));
      if(!busy)actions.append(button('Dismiss cleanup queue',async()=>{
        if(!confirm('Dismiss saved cleanup queue? Previously verified removals and Favorite History are kept.'))return;
        await DS.storageSet?.({[QUEUE]:null},{immediate:true});
        if(await get(QUEUE)!=null){update('Could not dismiss queue.');return;}
        cleanupQueue=null;render();
      }));
    }
    for(const b of actions.querySelectorAll('button'))if(b.textContent!=='Clear selection'&&busy&&!b.textContent.startsWith('Stop cleanup'))b.disabled=true;
    const manage=make('details');manage.className='ds-full-advanced';manage.open=cleanupExpanded;
    const manageTitle=make('summary',`Cleanup & bulk actions · ${selected.size} selected`);
    manageTitle.addEventListener('click',event=>{event.preventDefault();cleanupExpanded=!cleanupExpanded;manage.open=cleanupExpanded;});
    manage.append(manageTitle,actions);
    el.append(manage,make('p',`${result.length} matching ${filter==='account'?'account favorites':filter==='history'?'history records':'favorites missing from the native listing'} · Page ${page}/${count} · ${selected.size} selected. Opened does not imply a chat exists.`));
    const grid=make('div');grid.className='ds-full-grid';
    for(const m of shown){const card=make('article');card.className='ds-full-card';card.dataset.dsBotId=m.id;
      const imgLink=make('a');imgLink.href=m.chatUrl;if(m.image){const img=make('img');img.src=m.image;img.alt='';img.loading='lazy';img.decoding='async';imgLink.append(img);}else {imgLink.style.cssText='aspect-ratio:1/1;display:grid;place-items:center;background:#292929';imgLink.textContent='Image unavailable';}card.append(imgLink);
      const body=make('div');body.className='ds-full-card-main';const top=make('label');top.style.cssText='display:flex;gap:6px;align-items:center';const check=make('input');check.type='checkbox';check.checked=selected.has(m.id);check.addEventListener('change',()=>{check.checked?selected.add(m.id):selected.delete(m.id);render();});const name=make('strong',m.name);top.append(check,name);body.append(top);
      if(m.creator)body.append(make('small','@'+m.creator));
      if(m.title){const subtitle=make('p',m.title,'ds-full-card-subtitle');subtitle.title=m.title;body.append(subtitle);}
      if(m.description && m.description.trim().toLowerCase()!==String(m.title||'').trim().toLowerCase()){
        const desc=make('p',m.description,'ds-full-card-description');desc.title=m.description;body.append(desc);
      }
      const badges=make('div');badges.className='ds-full-tags';
      for(const t of [...m.tags.slice(0,15),...(m.inLater?['In Later']:[]),...(m.confirmedChat?['Chatted (confirmed)']:[]),...(m.indexedConversation?['Indexed chat']:[]),...(m.excluded?['Excluded']:[]),...(m.historyOnly?['Favorite History only']:[]),...m.folders.map(f=>'Folder: '+f),...(m.unavailable?['Not returned by search']:[])])badges.append(make('span',t));
      if(badges.childElementCount)body.append(badges);
      const links=make('div');links.className='ds-full-card-actions';for(const [txt,url] of [['Chat',m.chatUrl],['Profile',m.profileUrl]]){const a=make('a',txt);a.href=url;links.append(a);}
      if(!m.inLater){const laterBtn=button('Add Later',async()=>{
        laterBtn.disabled=true;
        try{await saveLater([m.id]);update(`Saved and verified in Later: ${m.name}`);render();}
        catch(error){update(`Later save failed: ${error.message}`);laterBtn.disabled=false;}
      });links.append(laterBtn);}
      if(m.opened)links.append(make('span','Opened','ds-full-opened'));body.append(links);card.append(body);grid.append(card);
    }el.append(grid);
    const paging=make('div');paging.className='ds-full-pager';const go=n=>{page=Math.max(1,Math.min(count,n));render();el.scrollIntoView({block:'start',behavior:'instant'});};
    paging.append(button('‹',()=>go(page-1)));for(let n=1;n<=count;n++)if(n===1||n===count||Math.abs(n-page)<=4){const b=button(String(n),()=>go(n));b.dataset.current=n===page?'1':'0';paging.append(b);}else if(n===2&&page>6||n===page+5&&page<count-5)paging.append(make('span','…'));paging.append(button('›',()=>go(page+1)));el.append(paging);
    if(autoTitles && !busy && active && viewMode==='separate' && autoTitleRequests<TITLE_AUTO_LIMIT){
      const key=[page,filter,sort,search,tag].join('~');
      if(!scheduledTitlePages.has(key) && shown.some(m=>m.found&&!m.title&&!attemptedTitles.has(m.id))){
        scheduledTitlePages.add(key);
        setTimeout(()=>{
          if(active&&enabled()&&!busy&&document.visibilityState==='visible'&&[page,filter,sort,search,tag].join('~')===key)void loadVisibleTitles(true);
        },1100);
      }
    }
  }
  function applyMode(){
    const hideNative=active&&viewMode==='separate';
    if(active){
      if(!originalTitle)originalTitle=document.title;
      document.title='Recovered Favorites (QoL) | SpicyChat';
    }else if(originalTitle){
      document.title=originalTitle;originalTitle='';
    }
    const tab=document.getElementById(TAB);
    if(tab){const label=active?'Recovered (QoL) · Open':'Recovered (QoL)';
      if(tab.textContent!==label)tab.textContent=label;
      const selected=active?'true':'false';
      if(tab.getAttribute('aria-selected')!==selected)tab.setAttribute('aria-selected',selected);
    }
    const root=document.documentElement;
    if(hideNative)root.dataset.dsFullFavoritesActive='1';
    else root.removeAttribute('data-ds-full-favorites-active');
    // Repair stale Later/Recovered style flags only if their view is not open.
    // A previous tab remount could otherwise leave native cards hidden forever.
    if(!active && !DS.isLaterFavoritesTabActive?.())root.removeAttribute('data-ds-later-active');
  }
  function setActive(next, navigate=true){
    const wasActive=active;
    active=!!next&&enabled();
    if(active&&!wasActive)viewMode='separate'; // Opening the tab never silently restores Below native.
    if(navigate&&isPage()){
      const desired=active?'#recovered':(location.hash==='#recovered'?'':location.hash);
      if(location.hash!==desired)history.pushState(history.state,'',location.pathname+location.search+desired);
    }
    if(active&&DS.isLaterFavoritesTabActive?.())DS.closeLaterFavoritesTab?.();
    let panel=document.getElementById(PANEL);
    if(active&&!panel?.isConnected){mount();panel=document.getElementById(PANEL);}
    if(active&&!panel?.isConnected){active=false;} // Never hide SpicyChat before the replacement exists.
    if(panel&&panel.hidden===active)panel.hidden=!active;
    applyMode();
    if(active)render();
    else {
      clearTimeout(filterRenderTimer);filterRenderTimer=null;
      // Restore native controls/cards immediately, even after a view-mode switch.
      const root=document.documentElement;
      root.removeAttribute('data-ds-full-favorites-active');
      if(!DS.isLaterFavoritesTabActive?.())root.removeAttribute('data-ds-later-active');
    }
  }
  function mount(){
    if(!enabled()){setActive(false,false);document.getElementById(TAB)?.remove();document.getElementById(PANEL)?.remove();return;}
    if(location.hash==='#recovered'&&!active){active=true;viewMode='separate';}
    // SPA navigation can use pushState without firing a hashchange event.
    // Do not keep the recovery stylesheet active on native Favorites URLs.
    else if(location.hash!=='#recovered'&&active){active=false;viewMode='separate';}
    const native=document.querySelector('[data-testid="SearchClientCharacterListing"]');
    if(!native?.isConnected||!native.parentElement){
      // React may not have mounted Favorites yet. Keep #recovered for a new-tab
      // deep link and let the normal Favorites refresh attach the view later.
      document.documentElement.removeAttribute('data-ds-full-favorites-active');
      return;
    }
    css();pagerHost(native);
    // Mark native results, not the entire React listing. Its tab bar stays usable.
    const rows=native.firstElementChild;
    if(rows?.children?.length>=3){
      const controls=rows.children[0],results=rows.children[rows.children.length-1];
      if(controls.dataset.dsFavoritesNativeControls!=='1')controls.dataset.dsFavoritesNativeControls='1';
      if(results.dataset.dsFavoritesNativeResults!=='1')results.dataset.dsFavoritesNativeResults='1';
    }
    // One launch surface beside SpicyChat's own Chatbots/Lorebooks/Groups
    // and QoL Later. Avoid a second floating button above the native controls.
    const tabs=native.querySelector('[role="tablist"]');
    let launch=document.getElementById(TAB);
    if(tabs&&(!launch||launch.parentElement!==tabs)){
      launch?.remove();launch=make('a','Recovered (QoL)');
      launch.href='/favorite-bots#recovered';
      launch.addEventListener('click',e=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();setActive(true);});
      launch.id=TAB;launch.setAttribute('role','tab');launch.className='relative cursor-pointer bg-transparent gap-sm flex flex-shrink-0 items-center justify-center transition-colors duration-200 min-w-10 text-gray-11 no-underline';
      tabs.append(launch);
    }else if(!tabs&&!launch){
      launch=make('a','Recovered (QoL)');launch.href='/favorite-bots#recovered';
      launch.addEventListener('click',e=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();setActive(true);});
      launch.id=TAB;native.insertAdjacentElement('beforebegin',launch);
    }
    if(launch){
      const label=active?'Recovered (QoL) · Open':'Recovered (QoL)';
      if(launch.textContent!==label)launch.textContent=label;
      const selected=active?'true':'false';
      if(launch.getAttribute('aria-selected')!==selected)launch.setAttribute('aria-selected',selected);
    }
    let panel=document.getElementById(PANEL);
    if(!panel||panel.previousElementSibling!==native){
      panel?.remove();panel=make('section');panel.id=PANEL;panel.setAttribute('aria-label','Recovered Favorites QoL view');
      native.insertAdjacentElement('afterend',panel);panel.hidden=!active;
    }
    if(active&&panel.hidden){panel.hidden=false;}
    if(!active&&!panel.hidden){panel.hidden=true;applyMode();}
    if(active&&(!panel.childElementCount||lastRenderedLater!==DS.state?.laterBots||lastRenderedHistory!==DS.state?.favoriteBots))render();
    // Keep the style flag in sync with the actual mounted panel.
    if(active&&panel.hidden===false&&document.documentElement.dataset.dsFullFavoritesActive!=='1'&&viewMode==='separate')applyMode();
  }
  DS.applyFavoritesRecovery=mount;
  document.addEventListener('click',e=>{
    if(!active)return;
    const tab=e.target?.closest?.('[data-testid="SearchClientCharacterListing"] [role="tablist"] [role="tab"]');
    if(tab&&tab.id!==TAB&&tab.id!=='ds-favorites-later-tab')setActive(false);
  },true);
  window.addEventListener('ds-qol-favorites-native-observed-v1',()=>setTimeout(()=>void capturePassive(),150));
  DS.openFullFavorites=()=>{mount();setActive(true);};
  DS.isFullFavoritesActive=()=>active&&enabled();
  DS.closeFullFavorites=()=>setActive(false);
  const onRoute=()=>{if(!isPage())return;const wanted=location.hash==='#recovered';if(wanted!==active)setActive(wanted,false);else mount();};
  window.addEventListener('popstate',onRoute);
  window.addEventListener('hashchange',onRoute);
  void Promise.all([readCoverage(),get(QUEUE),get('dsQolChatIndexV1'),get(EXCLUSIONS),get(VIEW_MODE),get(AUTO_TITLES),get(HISTORY_STATUS),get(OBSERVED_ADDED)]).then(([saved,queued,chatIndex,excluded,mode,autoPref,historySync,additions])=>{
    observedAdditions=additions?.at&&typeof additions.at==='object'?additions.at:{};
    DS.state.favoriteObservedAdditions=observedAdditions;
    autoTitles=autoPref!==false;
    // The supplementary view can still be selected within a tab, but not inherited on reopen.
    viewMode='separate';
    exclusions=new Set(uniq(excluded));indexedBots=new Map();
    for(const row of Object.values(chatIndex?.entries||{})){if(UUID.test(String(row?.botId||'')))indexedBots.set(row.botId.toLowerCase(),true);}
    if((saved?.version===1||saved?.version===2)&&Array.isArray(saved.ids)){coverage={...saved,listingVerified:saved.listingVerified===true||(Array.isArray(saved.listingIds)&&saved.listingIds.length>0&&Number(saved.listingCount)===saved.listingIds.length)};status=`Saved coverage from ${new Date(saved.checkedAt).toLocaleString()}${saved.metadataIncomplete?' (some card metadata missing)':''}. Refresh for current membership.`;}
    historySyncPending=historySync?.state==='pending'&&historySync?.checkedAt===coverage?.checkedAt;
    cleanupQueue=queued?.mode==='api'?queued:null;mount();
    // One-shot opt-in reload: no repeated navigation and no automatic writes.
    let resume=false;
    try{resume=sessionStorage.getItem(RESUME_NATIVE)==='1';sessionStorage.removeItem(RESUME_NATIVE);}catch{}
    if(resume && enabled())setTimeout(()=>{setActive(true);void refreshCoverage(false,true);},2500);
    if(isPage())setTimeout(()=>void capturePassive(),900);
  });
})();
