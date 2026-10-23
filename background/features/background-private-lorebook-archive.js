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
      else throw new Error('Unsupported archive operation.');
      respond({ok:true,result});
    })().catch(error=>respond({ok:false,error:String(error?.message||error)}));
    return true;
  });
})();
