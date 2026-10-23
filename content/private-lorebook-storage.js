// Private Lorebook storage RPC. All IndexedDB operations run in the EXTENSION's
// background context, not the webpage's origin. No page database is created.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const DS=window.DragonScriptQoL;
  if(!DS)return;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function keyOf(raw) {
    if(!raw?.accountId||!UUID.test(raw.botId)||!UUID.test(raw.conversationId)||!raw.detailId)
      throw new Error('Account, bot, conversation and detail IDs are required.');
    return JSON.stringify([String(raw.accountId),String(raw.botId).toLowerCase(),String(raw.conversationId).toLowerCase(),String(raw.detailId)]);
  }
  function send(op, data) {
    return new Promise((resolve,reject)=>{
      try {
        chrome.runtime.sendMessage({type:'DS_PRIVATE_LOREBOOK_ARCHIVE',op,...data},response=>{
          if(chrome.runtime.lastError)return reject(new Error(chrome.runtime.lastError.message));
          if(!response?.ok)return reject(new Error(response?.error||'Private archive extension storage unavailable.'));
          resolve(response.result);
        });
      }catch(error){reject(error);}
    });
  }
  const get=key=>{
    let values;
    try{values=JSON.parse(key)}catch{throw new Error('Invalid archive key.');}
    if(!Array.isArray(values)||values.length!==4)throw new Error('Invalid archive key.');
    const [accountId,botId,conversationId,detailId]=values;
    return send('get',{identity:{accountId,botId,conversationId,detailId}});
  };
  const list=(accountId,botId,conversationId)=>send('list',{identity:{accountId,botId,conversationId}});
  const put=(record,reason)=>send('put',{record,reason});
  const revisions=key=>{
    let values;
    try{values=JSON.parse(key)}catch{throw new Error('Invalid archive key.');}
    if(!Array.isArray(values)||values.length!==4)throw new Error('Invalid archive key.');
    const [accountId,botId,conversationId,detailId]=values;
    return send('revisions',{identity:{accountId,botId,conversationId,detailId}});
  };
  DS.privateLorebookStorage=Object.freeze({get,list,put,revisions,keyOf});
})();
}
