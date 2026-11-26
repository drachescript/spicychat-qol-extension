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
  const scope=dsqLorebookImportScope(m,s), db=await dsqLorebookImportOpen();
  const now=Date.now(), action=m.action;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['jobs','sources'],'readwrite'), jobs=tx.objectStore('jobs'), sources=tx.objectStore('sources');
    let result, error, changed;
    const abort=e=>{error=e;try{tx.abort();}catch{}};
    tx.oncomplete=()=>{
      if(changed){const o=changed.owner;if(o)dsqLorebookImportProtectedTabs.set(o.tabId,{bookId:scope.bookId,until:o.until});else dsqLorebookImportProtectedTabs.delete(scope.tabId);
        if(!['heartbeat','begin','receipt'].includes(action) && (action!=='commit'||changed.nextIndex%25===0||changed.nextIndex===changed.total))try{qolBackgroundTrace('lorebook-import','lorebook-import',{action,jobId:changed.jobId,phase:changed.phase,completed:changed.nextIndex,total:changed.total,retries:changed.retries,resumes:changed.resumes});}catch{} }
      resolve({ok:true,...result});};
    tx.onerror=tx.onabort=()=>reject(error||tx.error||Error('Import checkpoint transaction failed'));
    const r=jobs.get(scope.key);
    r.onsuccess=()=>{try{
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
        j.results.push({index:m.index,action:m.result,id:m.entryId||null,digest:j.pending?.digest||null,at:now});j.nextIndex++;if(m.result!=='skipped')j.lastSuccess=j.pending?.receipt?.at||now;j.pending=null;j.phase='running';save();return;
      }
      if(action==='finish'){
        if(j.pending||j.nextIndex!==j.total||!Number.isInteger(m.verifiedCount)||m.verifiedCount<0||m.verifiedCount>5000)throw Error('Cannot mark an incomplete import finished');
        j.verifiedCount=m.verifiedCount;j.verificationMode=m.verificationMode==='ids'?'ids':'native';j.phase='completed';j.owner=null;save();return;
      }
      if(action==='stop'){
        j.phase=m.phase==='cancelled'&&!j.pending?'cancelled':m.phase==='paused'?'paused':'interrupted';j.interruption=String(m.reason||'Import stopped').slice(0,120);j.owner=null;save();return;
      }
      throw Error('Unknown import operation');
    }catch(e){abort(e);}};
  });
}
dsqRegisterBackgroundMessageHandler('DS_LOREBOOK_IMPORT_JOB','lorebook-backup',(m,s,respond)=>{dsqLorebookImportMessage(m,s).then(respond,e=>respond({ok:false,error:String(e?.message||e)}));return true;});
