'use strict';
// Import source stays in a separate extension-local database, never cloud sync.
// A durable pending slot is committed BEFORE a native write; only an observed
// server result advances the source cursor. No lease expiry can resend a write.
let dsqLorebookImportDb;
const dsqLorebookImportProtectedTabs = new Map();
const DSQ_LI_UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function dsqLorebookImportOpen() {
  if (!dsqLorebookImportDb) dsqLorebookImportDb = new Promise((resolve,reject)=>{
    const r=indexedDB.open('dsq-lorebook-import-v1',1);
    r.onupgradeneeded=()=>{r.result.createObjectStore('jobs');r.result.createObjectStore('sources');};
    r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{db.close();dsqLorebookImportDb=null;};resolve(db);};
    r.onerror=r.onblocked=()=>reject(Error('Import checkpoint database unavailable'));
  }).catch(e=>{dsqLorebookImportDb=null;throw e;});
  return dsqLorebookImportDb;
}
function dsqLorebookImportTabProtected(tab) {
  const v=dsqLorebookImportProtectedTabs.get(Number(tab?.id));
  return !!v && v.until>Date.now() && String(tab?.url||'').includes(v.bookId);
}
async function dsqRestoreLorebookImportProtection() {
  if (!dsqBackgroundHasFeature('lorebook-backup')) return;
  const db=await dsqLorebookImportOpen();
  await new Promise((resolve,reject)=>{const tx=db.transaction('jobs');const r=tx.objectStore('jobs').getAll();
    r.onsuccess=()=>{for(const j of r.result||[])if(j.owner&&j.owner.until>Date.now())dsqLorebookImportProtectedTabs.set(j.owner.tabId,{bookId:j.bookId,until:j.owner.until});};
    tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);});
}
function dsqLorebookImportScope(m,s) {
  const u=new URL(s.url||s.tab?.url||'');
  const match=u.pathname.match(/^\/(?:[a-z]{2}\/)?lorebook\/(?:edit\/([0-9a-f-]{36})|([0-9a-f-]{36})\/edit)\/entries\/?$/i);
  const bookId=(match?.[1]||match?.[2]||'').toLowerCase();
  if(s.id!==chrome.runtime.id||s.frameId!==0||u.protocol!=='https:'||!['spicychat.ai','www.spicychat.ai'].includes(u.hostname)||!DSQ_LI_UUID.test(bookId)||bookId!==m.bookId||!s.tab?.id||(m.action!=='peek'&&(typeof m.accountId!=='string'||!m.accountId||m.accountId.length>160)))throw Error('Open the exact owned Lorebook Entries page.');
  return {key:bookId,bookId,tabId:s.tab.id,documentId:s.documentId||'',accountId:m.accountId};
}
async function dsqLorebookImportMessage(m,s) {
  if (String(m.action||'').startsWith('capture-')) return dsqLorebookCaptureMessage(m,s);
  if (['backup-acquire','backup-renew','backup-release'].includes(m.action)) return dsqLorebookBulkBackupLease(m,s);
  const scope=dsqLorebookImportScope(m,s), db=await dsqLorebookImportOpen();
  const now=Date.now(), action=m.action;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['jobs','sources'],'readwrite'), jobs=tx.objectStore('jobs'), sources=tx.objectStore('sources');
    let result, error, changed;
    const abort=e=>{error=e;try{tx.abort();}catch{}};
    tx.oncomplete=()=>{
      if(changed){try{dsqSctJournal(m,s,changed,now);}catch{} const o=changed.owner;if(o)dsqLorebookImportProtectedTabs.set(o.tabId,{bookId:scope.bookId,until:o.until});else dsqLorebookImportProtectedTabs.delete(scope.tabId);
        if(!['heartbeat','begin','receipt'].includes(action) && (action!=='commit'||changed.nextIndex%25===0||changed.nextIndex===changed.total))try{qolBackgroundTrace('lorebook-import','lorebook-import',{action,jobId:changed.jobId,phase:changed.phase,completed:changed.nextIndex,total:changed.total,retries:changed.retries,resumes:changed.resumes});}catch{} }
      resolve({ok:true,...result});};
    tx.onerror=tx.onabort=()=>reject(error||tx.error||Error('Import checkpoint transaction failed'));
    const r=jobs.get(scope.key);
    const handleJob=()=>{try{
      let j=r.result||null;
      if(action==='peek'){result={exists:!!j};return;}
      if(j&&j.accountId!==scope.accountId)throw Error('Saved import belongs to another account. No entries changed.');
      const live=j?.owner&&j.owner.until>now;
      const owns=live&&j.owner.runId===m.runId&&j.owner.tabId===scope.tabId;
      const sameReload=live&&j.owner.tabId===scope.tabId&&scope.documentId&&j.owner.documentId&&scope.documentId!==j.owner.documentId;
      const save=(checkpoint=true)=>{if(checkpoint)j.checkpointAt=now;jobs.put(j,scope.key);changed=j;result={job:j};};
      const owner=()=>({runId:m.runId,tabId:scope.tabId,documentId:scope.documentId,until:now+180000});
      const requireOwner=()=>{if(!owns||j.jobId!==m.jobId)throw Error('Import ownership expired or changed; reopen the job before continuing.');};
      if(action==='get'){
        if(j&&(!live||sameReload)&&j.owner){j.owner=null;j.phase='interrupted';j.interruption='Editor or extension stopped responding';save();}
        result={job:j,locked:!!(live&&!sameReload&&!owns)};return;
      }
      if(action==='start'){
        if(j&&!['completed','cancelled'].includes(j.phase))throw Error('A saved import already exists. Resume or cancel it instead.');
        if(!DSQ_LI_UUID.test(m.runId)||!Array.isArray(m.payload?.entries)||!m.payload.entries.length||m.payload.entries.length>5000||!['skip','merge','replace','add'].includes(m.policy))throw Error('Invalid import source or policy');
        if(m.payload.entries.some(e=>!e||typeof e.name!=='string'||!e.name.trim()||e.name.length>50||typeof e.content!=='string'||!e.content.trim()||e.content.length>2000||!Array.isArray(e.keywords)||e.keywords.length>12||e.keywords.some(k=>typeof k!=='string'||!k.trim()||k.length>80)))throw Error('An entry exceeds supported name, content or keyword limits. Nothing imported.');
        j={jobId:crypto.randomUUID(),bookId:scope.bookId,accountId:scope.accountId,policy:m.policy,total:m.payload.entries.length,nextIndex:0,results:[],pending:null,phase:'preparing',createdAt:now,lastSuccess:0,retries:0,resumes:0,owner:owner()};
        sources.put(m.payload,scope.key);save();return;
      }
      if(!j||m.jobId!==j.jobId)throw Error('Saved import changed. Reopen the job.');
      if(action==='resume'){
        if(['completed','cancelled'].includes(j.phase)||live&&!sameReload&&!owns||!DSQ_LI_UUID.test(m.runId))throw Error('Import is running elsewhere or already finished.');
        j.owner=owner();j.resumes++;j.phase=j.pending?'checking-uncertain-save':'preparing';save();const q=sources.get(scope.key);q.onsuccess=()=>{result.payload=q.result;if(!q.result)abort(Error('Saved source missing'));};return;
      }
      if(action==='cancel-saved'){
        if(live&&!sameReload)throw Error('Pause the running import first.');
        // Never allow a new job to bypass an unresolved write.
        if(j.pending)throw Error('An uncertain save must be reconciled before cancelling this job.');
        j.phase='cancelled';j.owner=null;save();return;
      }
      requireOwner();j.owner=owner();
      if(action==='heartbeat'){j.phase=j.pending?'waiting-for-save':String(m.phase||'running').slice(0,40);save(false);return;}
      if(action==='baseline'){
        if(!Number.isInteger(m.count)||m.count<0||m.count>5000)throw Error('Unsupported Lorebook count');
        if(j.initialCount==null)j.initialCount=m.count;
        if(Array.isArray(m.ids)&&m.ids.length===m.count&&m.ids.every(x=>DSQ_LI_UUID.test(x))&&new Set(m.ids).size===m.count&&!j.pending){j.baselineIds=m.ids;}
        j.phase='running';save();return;
      }
      if(action==='begin'){
        if(j.pending||m.index!==j.nextIndex||m.index>=j.total||!DSQ_LI_UUID.test(m.attemptId))throw Error('A previous write is unresolved or the import cursor changed.');
        j.pending={index:m.index,attemptId:m.attemptId,at:now,kind:m.kind==='update'?'update':'create',result:m.result,digest:m.digest};j.phase='waiting-for-save';save();return;
      }
      if(action==='not-sent'){
        if(!j.pending||j.pending.attemptId!==m.attemptId||j.pending.receipt)throw Error('Cannot clear an attempted write');
        j.pending=null;j.phase='running';save();return;
      }
      if(action==='receipt'){
        if(!j.pending||j.pending.attemptId!==m.attemptId||!Number.isInteger(m.status))throw Error('Receipt is not for the pending write');
        if(j.pending.receipt)throw Error('Receipt already recorded');
        j.pending.receipt={status:m.status,entryId:DSQ_LI_UUID.test(m.entryId)?m.entryId.toLowerCase():null,at:now};save();return;
      }
      if(action==='rejected'){
        if(!j.pending||j.pending.attemptId!==m.attemptId||![400,401,403,404,422].includes(m.status)||j.pending.receipt?.status!==m.status)throw Error('Write rejection is not definitive');
        j.pending=null;j.retries++;j.phase='paused';j.interruption='Server rejected the entry (HTTP '+m.status+')';j.owner=null;save();return;
      }
      if(action==='commit'){
        if(m.index!==j.nextIndex||m.index>=j.total||!['created','skipped','merged','replaced'].includes(m.result))throw Error('Invalid import checkpoint');
        if(m.result==='skipped'){if(j.pending||j.policy!=='skip')throw Error('Unexpected skip');}
        else if(!j.pending||j.pending.attemptId!==m.attemptId||!DSQ_LI_UUID.test(m.entryId)||((m.result==='created')!==(j.pending.kind==='create'))||(m.result==='created'&&(j.results.some(x=>x.id===m.entryId)||j.baselineIds?.includes(m.entryId))))throw Error('Missing or conflicting server entry identity');
        if(m.result!=='skipped'&&(m.result!==j.pending.result||(!m.reconciled&&!(j.pending.receipt?.status>=200&&j.pending.receipt.status<300&&j.pending.receipt.entryId===m.entryId))||(m.reconciled&&(!Array.isArray(j.baselineIds)||j.pending.kind!=='create'))))throw Error('Server receipt or verified reconciliation required');
        j.results.push({index:m.index,action:m.result,id:m.entryId||null,digest:j.pending?.digest||null,at:now,...(m.result==='skipped'&&m.verifiedExisting===true&&DSQ_LI_UUID.test(m.verifiedExistingId)?{verifiedExisting:true,verifiedExistingId:m.verifiedExistingId.toLowerCase()}: {})});j.nextIndex++;if(m.result!=='skipped')j.lastSuccess=j.pending?.receipt?.at||now;j.pending=null;j.phase='running';save();return;
      }
      if(action==='finish'){
        if(j.pending||j.nextIndex!==j.total||!Number.isInteger(m.verifiedCount)||m.verifiedCount<0||m.verifiedCount>5000)throw Error('Cannot mark an incomplete import finished');
        j.verifiedCount=m.verifiedCount;j.verificationMode=m.verificationMode==='ids'?'ids':'native';j.phase='completed';j.owner=null;save();return;
      }
      if(action==='stop'){
        j.phase=m.phase==='cancelled'&&!j.pending?'cancelled':m.phase==='paused'?'paused':'interrupted';j.interruption=String(m.reason||'Import stopped').slice(0,240);j.owner=null;save();return;
      }
      throw Error('Unknown import operation');
    }catch(e){abort(e);}};
    r.onsuccess=()=>{
      if(!['start','resume'].includes(action)){handleJob();return;}
      const check=jobs.get('bulk-backup:'+scope.bookId);
      check.onsuccess=()=>{if(check.result?.until>Date.now())abort(Error('A live backup is collecting this Lorebook in another tab. Wait for it to finish, then resume the import.'));else handleJob();};
    };
  });
}
// Bulk read leases share the import job transaction. Reserved keys cannot collide
// with UUID job keys, and no source, account identifier or entry data is exposed.
async function dsqLorebookBulkBackupLease(m,s) {
  const u=new URL(s.url||s.tab?.url||'');
  const id=String(m.bookId||'').toLowerCase(), runId=String(m.runId||'');
  if(s.id!==chrome.runtime.id||s.frameId!==0||!s.tab?.id||u.protocol!=='https:'||!['spicychat.ai','www.spicychat.ai'].includes(u.hostname)||!/^\/(?:[a-z]{2}\/)?my-creations\/lorebooks\/?$/i.test(u.pathname)||!DSQ_LI_UUID.test(id)||!DSQ_LI_UUID.test(runId))throw Error('Invalid bulk Lorebook backup context.');
  const db=await dsqLorebookImportOpen(), key='bulk-backup:'+id;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('jobs','readwrite'), jobs=tx.objectStore('jobs');
    let result, failure;
    tx.oncomplete=()=>resolve({ok:true,...result});
    tx.onabort=tx.onerror=()=>reject(failure||tx.error||Error('Lorebook coordination unavailable.'));
    const imp=jobs.get(id), lock=jobs.get(key);
    let ready=0;
    const handle=()=>{if(++ready!==2)return;try{
      const now=Date.now(), j=imp.result, old=lock.result;
      const ours=old?.runId===runId&&old.tabId===s.tab.id&&old.documentId===(s.documentId||'');
      const active=!!(j?.owner&&j.owner.until>now);
      const summary={importJobId:j?.jobId||null,phase:j?.phase||null,processed:j?.nextIndex??null,total:j?.total??null,verifiedCount:j?.phase==='completed'&&Number.isSafeInteger(j.verifiedCount)?j.verifiedCount:null};
      if(m.action==='backup-release'){if(ours)jobs.delete(key);result={released:!!ours};return;}
      if(m.action==='backup-renew'&&(!ours||old.until<=now||active||j?.pending)){result={acquired:false,reason:'lease-lost'};return;}
      if(active||j?.pending){result={acquired:false,reason:active?'import-active':'import-uncertain',...summary};return;}
      if(m.action==='backup-acquire'&&m.waitingJobId&&j?.jobId===m.waitingJobId&&!['completed','cancelled'].includes(j.phase)){result={acquired:false,reason:'import-paused',...summary};return;}
      if(old?.until>now&&!ours){result={acquired:false,reason:'backup-active',...summary};return;}
      jobs.put({runId,tabId:s.tab.id,documentId:s.documentId||'',until:now+180000},key);
      result={acquired:true,...summary};
    }catch(e){failure=e;tx.abort();}};
    imp.onsuccess=handle;lock.onsuccess=handle;
  });
}
// Immutable, account-scoped capture rows share the existing extension-local
// IndexedDB, not the import source itself or the portable backup/sync data.
// A failed capture never replaces the last complete snapshot. Only explicitly
// requested backups/import verification write here; tag expansion does not.
async function dsqLorebookCaptureMessage(m,s) {
  const u=new URL(s.url||s.tab?.url||'');
  const id=String(m.bookId||'').toLowerCase(), account=String(m.accountKey||'');
  const path=u.pathname.replace(/^\/[a-z]{2}(?=\/)/i,'').replace(/\/+$/,'');
  const editor=path.match(/^\/lorebook\/(?:edit\/([0-9a-f-]{36})|([0-9a-f-]{36})\/edit)(?:\/(?:entries|details))?$/i);
  const allowed=path==='/my-creations/lorebooks'||(editor&&(editor[1]||editor[2]).toLowerCase()===id);
  if(s.id!==chrome.runtime.id||s.frameId!==0||!s.tab?.id||u.protocol!=='https:'||!['spicychat.ai','www.spicychat.ai'].includes(u.hostname)||!allowed||!DSQ_LI_UUID.test(id)||!/^[a-f0-9]{64}$/.test(account))throw Error('Invalid Lorebook capture context');
  const action=m.action, runId=String(m.runId||'');
  if(!['capture-read','capture-clear'].includes(action)&&!DSQ_LI_UUID.test(runId))throw Error('Invalid capture ID');
  const key='capture:'+account+':'+id;
  let incoming=[];
  if(action==='capture-page'){
    if(!Array.isArray(m.entries)||m.entries.length>100||!Number.isSafeInteger(m.offset)||m.offset<0||m.offset>5000)throw Error('Invalid capture page');
    const seen=new Set();
    // Compute digests before opening the IndexedDB transaction. Same ID and
    // exact normalized row content share storage even if page order shifts.
    incoming=await Promise.all(m.entries.map(async row=>{
      if(!row||!DSQ_LI_UUID.test(row.id)||seen.has(row.id)||typeof row.content!=='string'||row.content.length>24000||typeof row.name!=='string'||!Array.isArray(row.keywords))throw Error('Invalid capture row');
      seen.add(row.id);const json=JSON.stringify(row);if(json.length>64000)throw Error('Capture row too large');
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(json))),x=>x.toString(16).padStart(2,'0')).join('');
      return {id:row.id,key:key+':row:'+row.id+':'+digest,row};
    }));
  }
  // A cache scope has one writer. Normal live export continues if cache
  // storage fails, and no cache operation ever affects the import cursor.
  const db=await dsqLorebookImportOpen();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('sources','readwrite'), st=tx.objectStore('sources');let result,failure;
    const fail=e=>{failure=e;try{tx.abort();}catch{}};
    tx.oncomplete=()=>resolve({ok:true,...result});tx.onabort=tx.onerror=()=>reject(failure||tx.error||Error('Lorebook capture storage failed'));
    const q=st.get(key);
    q.onsuccess=()=>{try{
      const now=Date.now();let b=q.result||{known:[],complete:null,draft:null};
      const owns=b.draft?.runId===runId&&b.draft?.tabId===s.tab.id&&b.draft?.documentId===(s.documentId||'');
      const active=!!(b.draft?.until>now), save=()=>st.put(b,key);
      const prune=keep=>{const set=new Set(keep);for(const k of b.known||[])if(!set.has(k))st.delete(k);b.known=[...set];};
      if(action==='capture-start'){
        if(active&&!owns){result={acquired:false};return;}
        if(!Number.isInteger(m.total)||m.total<0||m.total>5000)throw Error('Invalid capture total');
        const prior=b.draft?.keys||[];
        prune([...(b.complete?.keys||[]),...prior]);
        b.draft={runId,tabId:s.tab.id,documentId:s.documentId||'',until:now+180000,total:m.total,keys:[],ids:[],prior,startedAt:now};
        save();result={acquired:true,previouslySaved:prior.length,previousComplete:b.complete?.keys?.length||0};return;
      }
      if(action==='capture-read'){
        const c=b.complete;if(!c){result={snapshot:null};return;}
        const rows=Array(c.keys.length);let pending=c.keys.length;
        const finish=()=>{result={snapshot:{schema:'spicychat-qol-lorebook-recovery-copy',version:1,savedAt:c.at,fetchedAt:new Date(c.at).toISOString(),source:'saved-verified-capture',completeness:{details:true,entries:true,entryCountVerified:true},lorebook:c.meta,entries:rows}};};
        if(!pending){finish();return;}
        c.keys.forEach((k,i)=>{const r=st.get(k);r.onsuccess=()=>{if(!r.result||r.result.id!==c.ids[i]){fail(Error('Saved capture is missing an entry'));return;}rows[i]=r.result;if(!--pending)finish();};});return;
      }
      if(action==='capture-clear'){
        if(active)throw Error('A capture is still active. Finish it before clearing its cache.');
        prune([]);st.delete(key);result={cleared:true};return;
      }
      if(!owns)throw Error('Lorebook capture ownership changed');
      const d=b.draft;
      if(action==='capture-stop'){d.until=0;save();result={saved:d.keys.length};return;}
      if(!active)throw Error('Lorebook capture lease expired');
      if(action==='capture-page'){
        if(d.keys.length!==m.offset||d.total!==m.total||d.keys.length+incoming.length>d.total)throw Error('Capture page order or count changed');
        const ids=new Set(d.ids), known=new Set(b.known), previous=new Map((b.complete?.ids||[]).map((v,i)=>[v,b.complete.keys[i]]));
        let reused=0,added=0,changed=0;
        for(const x of incoming){if(ids.has(x.id))throw Error('Duplicate capture entry ID');ids.add(x.id);
          if(known.has(x.key))reused++;else{st.put(x.row,x.key);known.add(x.key);}
          if(!previous.has(x.id))added++;else if(previous.get(x.id)!==x.key)changed++;
          d.keys.push(x.key);d.ids.push(x.id);}
        b.known=[...known];d.until=now+180000;save();result={reused,added,changed,saved:d.keys.length};return;
      }
      if(action==='capture-finish'){
        if(d.keys.length!==d.total||!m.meta||String(m.meta.id||'').toLowerCase()!==id||m.meta.entryCount!==d.total||typeof m.meta.name!=='string')throw Error('Capture not complete');
        const oldIds=new Set(b.complete?.ids||[]),newIds=new Set(d.ids);let removed=0;for(const x of oldIds)if(!newIds.has(x))removed++;
        b.complete={keys:d.keys,ids:d.ids,meta:m.meta,at:now};b.draft=null;prune(b.complete.keys);save();result={verified:d.total,removed};return;
      }
      throw Error('Unknown Lorebook capture operation');
    }catch(e){fail(e);}};
  });
}

dsqRegisterBackgroundMessageHandler('DS_LOREBOOK_IMPORT_JOB','lorebook-backup',(m,s,respond)=>{dsqLorebookImportMessage(m,s).then(respond,e=>respond({ok:false,error:String(e?.message||e)}));return true;});
