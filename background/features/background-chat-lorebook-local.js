"use strict";
// Local conversation Lorebook writes share one queue across SpicyChat tabs.
// Read-only consumers still use chrome.storage.local directly. Never touches
// native Lorebooks or sends chat information to the network.
(() => {
  const TYPE = 'DS_CHAT_LOREBOOK_MUTATE';
  const KEY = 'dsQolChatLorebookDraftsV1';
  const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const CHAT = new RegExp(`^conversation:(${UUID})$`, 'i');
  const PATH = new RegExp(`/(?:chat)/${UUID}/(${UUID})(?:/|$)`, 'i');
  const pipelines = new Map();
  const norm = value => String(value || '').normalize('NFKC').trim().toLowerCase();
  const storageGet = () => new Promise((resolve, reject) => chrome.storage.local.get(KEY, result => {
    const error = chrome.runtime.lastError;
    error ? reject(new Error(error.message)) : resolve(result?.[KEY] || {});
  }));
  const storageSet = data => new Promise((resolve, reject) => chrome.storage.local.set({[KEY]:data}, () => {
    const error = chrome.runtime.lastError;
    error ? reject(new Error(error.message)) : resolve();
  }));
  const isRecord = (record, chatId) => !!record && typeof record === 'object' &&
    record.chatId === chatId && /^[0-9a-f-]{36}$/i.test(String(record.entryId||'')) &&
    typeof record.name === 'string' && !!record.name.trim() && record.name.length <= 50 &&
    typeof record.content === 'string' && !!record.content.trim() && record.content.length <= 2000 &&
    Array.isArray(record.keywords) && record.keywords.length <= 12 &&
    record.keywords.every(word => typeof word === 'string' && word.length <= 80) &&
    JSON.stringify(record).length <= 12000;
  function find(list, key) {
    if (typeof key !== 'string') return null;
    if (key.startsWith('id:')) {
      const matches = list.map((entry,index) => ({entry,index})).filter(x => x.entry?.entryId === key.slice(3));
      return matches.length === 1 ? matches[0] : null;
    }
    const legacy = /^legacy:(\d+)$/.exec(key);
    const index = legacy ? Number(legacy[1]) : -1;
    return index >= 0 && index < list.length && !list[index]?.entryId ? {entry:list[index], index} : null;
  }
  function unique(list, record, except=-1) {
    if(list.some((entry,index) => index !== except && (entry.entryId === record.entryId ||
      (norm(entry.name) === norm(record.name) && norm(entry.content) === norm(record.content))))) {
      throw new Error('This local Lorebook entry already exists. Refresh the editor.');
    }
  }
  async function change(message, sender) {
    const chatId = String(message?.chatId || '');
    const wanted = CHAT.exec(chatId)?.[1]?.toLowerCase();
    const uri = String(sender?.url || sender?.tab?.url || '');
    let parsed;
    try { parsed = new URL(uri); } catch { throw new Error('Invalid SpicyChat tab.'); }
    const actual = PATH.exec(parsed.pathname)?.[1]?.toLowerCase();
    if(parsed.protocol !== 'https:' || !['spicychat.ai','www.spicychat.ai'].includes(parsed.hostname) ||
        !wanted || !actual || wanted !== actual) throw new Error('Conversation mismatch. No local Lorebook changes made.');
    const all = await storageGet();
    const current = Array.isArray(all[chatId]) ? [...all[chatId]] : [];
    const op = String(message?.op || '');
    let count=0;
    if(op === 'create') {
      const record=message.record;
      if(!isRecord(record,chatId)) throw new Error('Invalid local Lorebook entry.');
      if(current.length >= 200) throw new Error('Local Lorebook has reached 200 entries.');
      unique(current,record); current.push(record);count=1;
    } else if(op === 'replace' || op === 'delete') {
      const match = find(current,message.key);
      if(!match || typeof message.expected !== 'string' || JSON.stringify(match.entry) !== message.expected)
        throw new Error('This local Lorebook entry changed in another tab. Refresh before editing.');
      if(op === 'delete') current.splice(match.index,1);
      else {
        const record=message.record;
        if(!isRecord(record,chatId) || (match.entry?.entryId && match.entry.entryId !== record.entryId))
          throw new Error('Invalid or mismatched local Lorebook revision.');
        unique(current,record,match.index);current[match.index]=record;
      }
      count=1;
    } else if(op === 'import') {
      const incoming=message.records;
      if(!Array.isArray(incoming) || incoming.length > 200 || !incoming.every(x=>isRecord(x,chatId) && x.disabled===true))
        throw new Error('Invalid or non-reviewed Lorebook import.');
      const known=new Set(current.map(x=>JSON.stringify([norm(x.name),norm(x.content)])));
      const ids=new Set(current.map(x=>x.entryId));
      for(const record of incoming) {
        const fingerprint=JSON.stringify([norm(record.name),norm(record.content)]);
        if(known.has(fingerprint))continue;
        if(ids.has(record.entryId))throw new Error('A local Lorebook ID is already in use.');
        known.add(fingerprint);ids.add(record.entryId);current.push(record);count++;
      }
      if(current.length>200)throw new Error('Import would exceed the 200-entry local Lorebook limit.');
    } else throw new Error('Unsupported local Lorebook operation.');
    if(count) {all[chatId]=current;await storageSet(all);}
    return {count,total:current.length};
  }
  dsqRegisterBackgroundMessageHandler(TYPE,'chat-lorebook-manager',(message,sender,respond) => {
    // All writers to this shared storage object must serialize, even when
    // they target different conversations (storage.local.set replaces it whole).
    const previous = pipelines.get(KEY) || Promise.resolve();
    const result = previous.catch(()=>{}).then(()=>change(message,sender));
    const tail = result.catch(()=>{});
    pipelines.set(KEY,tail);
    tail.finally(()=>{if(pipelines.get(KEY)===tail)pipelines.delete(KEY);});
    result.then(data=>respond({ok:true,result:data}),error=>respond({ok:false,error:String(error?.message||error)}));
    return true;
  });
})();
