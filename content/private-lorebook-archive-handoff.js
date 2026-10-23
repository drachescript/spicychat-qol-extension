// Reviewed, native-editor-only Archive entry handoff. Does not submit or
// attach a Lorebook. The user decides whether to press SpicyChat's Save button.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  'use strict';
  const DS=window.DragonScriptQoL;
  if(!DS)return;
  const KEY='dsQolPrivateArchiveEntryQueueV1';
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const read=()=>new Promise((resolve,reject)=>chrome.storage.local.get(KEY,r=>chrome.runtime.lastError?reject(Error(chrome.runtime.lastError.message)):resolve(r?.[KEY]||null)));
  const write=obj=>new Promise((resolve,reject)=>chrome.storage.local.set({[KEY]:obj},()=>chrome.runtime.lastError?reject(Error(chrome.runtime.lastError.message)):resolve()));
  const clear=()=>new Promise((resolve,reject)=>chrome.storage.local.remove(KEY,()=>chrome.runtime.lastError?reject(Error(chrome.runtime.lastError.message)):resolve()));
  const text=(tag,content)=>{const el=document.createElement(tag);if(content)el.textContent=content;return el;};
  async function queue({accountId,botId,conversationId,bookId,attachedBookId,detailId,payload}) {
    if(!DS.state?.settings?.enabled || !DS.state.settings.enablePrivateLorebookBridge ||
      !accountId || !UUID.test(botId) || !UUID.test(conversationId) || !UUID.test(bookId) || !UUID.test(attachedBookId) || bookId===attachedBookId ||
      !detailId || !payload?.name || !payload?.content || !Array.isArray(payload.keywords) ||
      payload.keywords.length!==1 || !/^qol-archive-[a-z0-9]{1,12}$/i.test(payload.keywords[0]) ||
      !String(payload.name).startsWith('QoL Archive ') || payload.content.length>2000)
      throw Error('Invalid Archive editor handoff.');
    const existing=await read();
    if(existing && Date.now()-Number(existing.at||0)<30*60*1000)
      throw Error('Another Archive editor entry is already queued. Open that editor or discard its queue first.');
    const token=crypto.randomUUID();
    await write({schema:1,token,accountId,botId,conversationId,bookId,attachedBookId,detailId,payload,at:Date.now()});
    return token;
  }
  let busy=false;
  async function apply() {
    if(busy || !DS.state?.settings?.enabled || !DS.state.settings.enablePrivateLorebookBridge)return;
    const match=location.pathname.match(/^\/lorebook\/edit\/([0-9a-f-]{36})\/entries\/?$/i);
    if(!match || document.getElementById('ds-private-archive-queue'))return;
    const queued=await read();
    if(!queued || queued.schema!==1 || !UUID.test(queued.bookId) ||
      queued.bookId!==match[1].toLowerCase() || Date.now()-queued.at>30*60*1000)return;
    const host=document.querySelector("[data-testid='EntriesCreateHeader-AddEntryButton']")?.parentElement;
    if(!host)return;
    const box=text('div');box.id='ds-private-archive-queue';box.className='ds-private-lb-queue';
    box.append(text('span','QoL private Archive entry waiting for review. '));
    const review=text('button','Review Archive entry');review.type='button';
    const discard=text('button','Discard queued draft');discard.type='button';
    discard.addEventListener('click',async()=>{try{await clear();box.remove();}catch(error){box.append(text('span',String(error?.message||error)));}});
    review.addEventListener('click',async()=>{
      if(busy)return;busy=true;review.disabled=true;
      try {
        const latest=await read();
        if(!latest || latest.token!==queued.token || !location.pathname.match(/^\/lorebook\/edit\/([0-9a-f-]{36})\/entries\/?$/i) ||
          !location.pathname.toLowerCase().includes('/'+queued.bookId+'/entries'))
          throw Error('Queue or editor changed.');
        const api=DS.privateLorebookAuth?.request;
        if(typeof api!=='function')throw Error('Native ownership verification unavailable.');
        const user=await api('/v2/users');
        if(user?.user?.id!==queued.accountId)throw Error('Account changed.');
        const bot=await api(`/v2/characters/${queued.botId}?include=rulebook`);
        if(bot?.creator_user_id!==queued.accountId || !['hidden','private'].includes(bot?.visibility) ||
          !Array.isArray(bot.lorebooks) || bot.lorebooks.length!==1 ||
          bot.lorebooks[0].id!==queued.attachedBookId)
          throw Error('Bot ownership or private attached Lorebook association was not verified.');
        const attached=await api(`/lorebooks/${queued.attachedBookId}?sortBy=priority&lastSortPriority=0`);
        if(attached?.id!==queued.attachedBookId || attached.creator_user_id!==queued.accountId || attached.visibility!=='private')
          throw Error('The bot attached Lorebook changed or is not owned/private.');
        const lb=await api(`/lorebooks/${queued.bookId}?sortBy=priority&lastSortPriority=0`);
        if(lb?.id!==queued.bookId || lb.creator_user_id!==queued.accountId || lb.visibility!=='private' ||
          lb.numAttachedCharacters!==0)throw Error('Archive is not verified private, owned, and connected to zero bots.');
        const add=document.querySelector("[data-testid='EntriesCreateHeader-AddEntryButton']");
        if(!add)throw Error('SpicyChat Add Entry button unavailable.');
        add.click();
        let name,content;
        for(let i=0;i<30;i++) {
          name=[...document.querySelectorAll('input[name="name"]')].find(el=>el.getClientRects().length);
          content=[...document.querySelectorAll('textarea[name="content"]')].find(el=>el.getClientRects().length);
          if(name&&content)break;
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        if(!name||!content)throw Error('SpicyChat entry editor did not appear.');
        const setValue=(field,value)=>{
          const proto=field instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto,'value')?.set?.call(field,value);
          field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
        };
        setValue(name,queued.payload.name);setValue(content,queued.payload.content);
        const form=content.closest('form')||content.parentElement;
        const input=[...(form?.querySelectorAll('input')||[])].find(el=>el!==name && /keyword|tag/i.test(el.placeholder||''));
        if(!input)throw Error('SpicyChat keyword field is missing; review and fill it manually.');
        setValue(input,queued.payload.keywords[0]);
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
        box.replaceChildren(text('span','Archive draft filled. Check the name, keyword and content, then press SpicyChat Save. Afterwards return to the chat and use Recover / reconcile Archive entries.'));
        await clear();
      } catch(error) {
        box.append(text('span',' '+String(error?.message||error)));
        review.disabled=false;
      } finally {busy=false;}
    });
    box.append(review,discard);host.append(box);
  }
  DS.queuePrivateArchiveEditorEntry=queue;
  DS.applyPrivateArchiveEntryHandoff=apply;
})();
