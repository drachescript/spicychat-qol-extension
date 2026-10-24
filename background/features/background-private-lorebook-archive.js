'use strict';
// Private Lorebook Archive data lives in the EXTENSION ORIGIN, never in
// spicychat.ai's page-origin IndexedDB. Optional, feature-owned background RPC.
(() => {
  const TYPE='DS_PRIVATE_LOREBOOK_ARCHIVE';
  const DB_NAME='ds-qol-private-lorebook-archive-v1';
  const STORE='records', AUDIT='revisions';
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let opening;
  const queues = new Map();
  const validate = value => {
    const accountId=String(value?.accountId||'');
    const botId=String(value?.botId||'').toLowerCase();
    const conversationId=String(value?.conversationId||'').toLowerCase();
    const detailId=String(value?.detailId||'');
    if (accountId.length<4 || accountId.length>160 || !UUID.test(botId) || !UUID.test(conversationId) ||
      !detailId || detailId.length>200) throw new Error('Invalid private archive record identity.');
    return {accountId,botId,conversationId,detailId};
  };
  const keyOf = raw => {
    const v=validate(raw);
    return JSON.stringify([v.accountId,v.botId,v.conversationId,v.detailId]);
  };
  function database() {
    if(!opening)opening=new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(STORE)) {
          const records=db.createObjectStore(STORE,{keyPath:'key'});
          records.createIndex('conversation','conversationKey',{unique:false});
        }
        if(!db.objectStoreNames.contains(AUDIT)) {
          const revisions=db.createObjectStore(AUDIT,{keyPath:'id'});
          revisions.createIndex('byKey','key',{unique:false});
        }
      };
      req.onerror=()=>reject(req.error||new Error('Extension IndexedDB unavailable'));
      req.onsuccess=()=>resolve(req.result);
    }).catch(error=>{opening=null;throw error;});
    return opening;
  }
  async function get(key) {
    const db=await database();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(STORE,'readonly').objectStore(STORE).get(key);
      req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
    });
  }
  async function list(raw) {
    const v=validate({...raw,detailId:'_scope_only_'});
    const key=JSON.stringify([v.accountId,v.botId,v.conversationId]);
    const db=await database();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(STORE,'readonly').objectStore(STORE).index('conversation').getAll(key);
      req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);
    });
  }
  async function put(raw,reason) {
    const key=keyOf(raw);
    const prior=queues.get(key)||Promise.resolve();
    const task=prior.catch(()=>{}).then(async()=>{
      const db=await database(),before=await get(key);
      const record={...raw,key,conversationKey:JSON.stringify([raw.accountId,raw.botId.toLowerCase(),raw.conversationId.toLowerCase()]),updatedAt:Date.now()};
      const serialized=JSON.stringify(record);
      if(serialized.length>20000)throw new Error('Archive record exceeds size limit.');
      return new Promise((resolve,reject)=>{
        const tx=db.transaction([STORE,AUDIT],'readwrite');
        tx.objectStore(AUDIT).put({id:`${Date.now()}-${crypto.randomUUID()}`,key,
          reason:String(reason||'Updated archived detail').slice(0,100),at:Date.now(),before,after:record});
        tx.objectStore(STORE).put(record);
        tx.oncomplete=()=>resolve(record);
        tx.onerror=()=>reject(tx.error||new Error('Archive write failed'));
        tx.onabort=()=>reject(tx.error||new Error('Archive write aborted'));
      });
    });
    const safe=task.catch(()=>{});queues.set(key,safe);
    safe.finally(()=>{if(queues.get(key)===safe)queues.delete(key);});
    return task;
  }
  // Import is add-only and conversation-scoped. A restored backup must NEVER
  // overwrite a record from this device, even if another tab writes during
  // import. IndexedDB serializes readwrite transactions on the records store.
  async function importMissing(raw, entries) {
    const owner=validate({...raw,detailId:'_scope_only_'});
    if(!Array.isArray(entries)||entries.length<1||entries.length>50)
      throw new Error('Restore accepts 1–50 records at a time.');
    const seen=new Set(),prepared=[];
    for(const incoming of entries){
      if(!incoming||typeof incoming!=='object'||Array.isArray(incoming))throw new Error('Invalid backup record.');
      const identity=validate(incoming),key=keyOf(identity);
      if(identity.accountId!==owner.accountId || identity.botId!==owner.botId ||
         identity.conversationId!==owner.conversationId||seen.has(key))
        throw new Error('Backup record belongs to another account, conversation or is duplicated.');
      if(typeof incoming.content!=='string'||!incoming.content.trim()||incoming.content.length>2000||
         typeof incoming.name!=='string'||incoming.name.length>50||
         (incoming.keywords!=null&&(!Array.isArray(incoming.keywords)||incoming.keywords.length>12||
           incoming.keywords.some(x=>typeof x!=='string'||x.length>80))))
        throw new Error('Invalid backup record content.');
      // Unverified native links must not be reused for automatic operations.
      // Preserve the IDs for manual reconciliation; never issue remote writes.
      const record={...incoming,accountId:owner.accountId,botId:owner.botId,
        conversationId:owner.conversationId,detailId:identity.detailId,key,
        conversationKey:JSON.stringify([owner.accountId,owner.botId,owner.conversationId]),
        status:'restored-needs-review',needsReview:true,updatedAt:Date.now()};
      if(record.remote?.id)record.remote={...record.remote,stale:true,status:'restored-unverified'};
      if(record.native?.id)record.native={...record.native,stale:true,verifiedCreated:false};
      if(JSON.stringify(record).length>20000)throw new Error('Backup record exceeds size limit.');
      seen.add(key);prepared.push(record);
    }
    const db=await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction([STORE,AUDIT],'readwrite');
      const records=tx.objectStore(STORE),audit=tx.objectStore(AUDIT);
      let inserted=0,skipped=0;
      for(const row of prepared){
        const lookup=records.get(row.key);
        lookup.onsuccess=()=>{
          if(lookup.result){skipped++;return;}
          records.add(row);inserted++;
          audit.add({id:`${Date.now()}-${crypto.randomUUID()}`,key:row.key,
            reason:'Restored missing local Archive record (review required)',at:Date.now(),
            before:null,after:row});
        };
      }
      tx.oncomplete=()=>resolve({inserted,skipped});
      tx.onerror=()=>reject(tx.error||new Error('Archive restore failed'));
      tx.onabort=()=>reject(tx.error||new Error('Archive restore aborted'));
    });
  }
  async function revisions(key) {
    const db=await database();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(AUDIT,'readonly').objectStore(AUDIT).index('byKey').getAll(key);
      req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>b.at-a.at));req.onerror=()=>reject(req.error);
    });
  }
  // A content script cannot forge a privileged extension sender. Also reject
  // other website origins even when extension APIs are exposed there.
  dsqRegisterBackgroundMessageHandler(TYPE,'private-lorebook-bridge',(message,sender,respond)=>{
    if(sender?.tab && !/^https:\/\/(?:www\.)?spicychat\.ai\//i.test(sender.url||sender.tab.url||'')){
      respond({ok:false,error:'Private archive only accepts SpicyChat tabs.'});return false;
    }
    (async()=>{
      const op=String(message?.op||'');let result;
      if(op==='get')result=await get(keyOf(message?.identity));
      else if(op==='list')result=await list(message?.identity);
      else if(op==='put')result=await put(message?.record,message?.reason);
      else if(op==='revisions')result=await revisions(keyOf(message?.identity));
      else if(op==='importMissing') {
        const identity=validate({...message?.identity,detailId:'_scope_only_'});
        const page=new URL(String(sender?.url||sender?.tab?.url||''));
        const path=/^\/chat\/([0-9a-f-]{36})\/([0-9a-f-]{36})(?:\/|$)/i.exec(page.pathname);
        if(!sender?.tab?.id || page.protocol!=='https:' || !['spicychat.ai','www.spicychat.ai'].includes(page.hostname) ||
           !path || path[1].toLowerCase()!==identity.botId || path[2].toLowerCase()!==identity.conversationId)
          throw new Error('Restore requires the matching open SpicyChat conversation.');
        result=await importMissing(identity,message?.records);
      }
      else throw new Error('Unsupported archive operation.');
      respond({ok:true,result});
    })().catch(error=>respond({ok:false,error:String(error?.message||error)}));
    return true;
  });
})();
