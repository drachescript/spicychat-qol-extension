'use strict';
// Context Keeper's shared local store contains several conversations. Serialize
// all QoL Context Keeper changes across tabs, comparing each conversation with
// the snapshot used to edit it before writing. No native API calls.
(() => {
  const TYPE = 'DS_CONTEXT_KEEPER_MUTATE';
  const KEY = 'contextKeeperData';
  const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const CHAT = new RegExp(`^conversation:(${UUID})$`, 'i');
  const PATH = new RegExp(`^/chat/${UUID}/(${UUID})(?:/|$)`, 'i');
  let queue = Promise.resolve();
  const get = () => new Promise((resolve, reject) => chrome.storage.local.get(KEY, data =>
    chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(data?.[KEY] || {})));
  const put = value => new Promise((resolve, reject) => chrome.storage.local.set({[KEY]:value}, () =>
    chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()));
  async function mutate(message, sender) {
    let page;
    try { page = new URL(String(sender?.tab?.url || sender?.url || '')); }
    catch { throw new Error('Context Keeper requires a signed-in SpicyChat chat tab.'); }
    const conversation = PATH.exec(page.pathname)?.[1]?.toLowerCase();
    if(page.protocol !== 'https:' || !['spicychat.ai','www.spicychat.ai'].includes(page.hostname) ||
       !sender?.tab?.id || !conversation) throw new Error('Invalid Context Keeper source tab.');
    const patches = message?.patches;
    if(!Array.isArray(patches) || patches.length < 1 || patches.length > 5 ||
       JSON.stringify(patches).length > 2500000) throw new Error('Invalid Context Keeper patch.');
    const unique = new Set();
    for(const patch of patches) {
      const id = CHAT.exec(String(patch?.chatId || ''))?.[1]?.toLowerCase();
      if(!id || id !== conversation || unique.has(id) ||
         (patch.previous != null && (typeof patch.previous !== 'object' || Array.isArray(patch.previous))) ||
         (patch.value != null && (typeof patch.value !== 'object' || Array.isArray(patch.value))) ||
         (patch.value && (!Array.isArray(patch.value.details) || patch.value.details.length > 2000)))
        throw new Error('Context Keeper conversation mismatch or invalid entry.');
      unique.add(id);
    }
    const old = await get();
    const current = old && typeof old === 'object' && !Array.isArray(old) ? old : {};
    for (const patch of patches) {
      if(JSON.stringify(current[patch.chatId] ?? null) !== JSON.stringify(patch.previous ?? null))
        throw new Error('This Context Keeper conversation changed in another tab. Refresh before saving.');
    }
    const next = {...current};
    for (const patch of patches) {
      if(patch.value == null) delete next[patch.chatId];
      else next[patch.chatId] = patch.value;
    }
    await put(next);
    return message.recordChange ? {before:current,after:next} : {};
  }
  dsqRegisterBackgroundMessageHandler(TYPE,'context-keeper',(message,sender,respond) => {
    const task = queue.catch(()=>{}).then(()=>mutate(message,sender));
    queue = task.catch(()=>{});
    task.then(result=>respond({ok:true,...result}),error=>respond({ok:false,error:String(error?.message||error)}));
    return true;
  });
})();
