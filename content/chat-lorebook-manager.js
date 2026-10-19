// Opt-in draft editor for Chat / Memory -> Lorebook. Does not use an
// undocumented private endpoint or modify a user's actual lorebook without review.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const KEY = 'dsQolChatLorebookDraftsV1';
  const PENDING_KEY = 'dsQolChatLorebookPendingEntryV1';
  const MODAL = 'ds-chat-lorebook-modal';
  const MAX_ENTRIES = 200;
  const clamp = (v, limit) => String(v || '').trim().slice(0, limit);
  const chatId = () => location.pathname.match(/^\/chat\/([0-9a-f-]{36})(?:\/|$)/i)?.[1]?.toLowerCase() || '';
  function storageGet() { return new Promise(resolve => chrome.storage.local.get([KEY], data => resolve(data?.[KEY] || {}))); }
  function storageSet(value) { return new Promise((resolve, reject) => chrome.storage.local.set({[KEY]: value}, () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve())); }
  const $ = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; return el; };
  function download(filename, text) {
    const blob = new Blob([text], {type: 'application/json;charset=utf-8'});
    const href = URL.createObjectURL(blob); const a = $('a'); a.href = href; a.download = filename;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 1500);
  }
  function field(parent, title, kind, value, limit) {
    const label = $('label'); label.textContent = title;
    const input = $(kind); input.value = value || ''; input.maxLength = limit;
    label.append(input); parent.append(label); return input;
  }
  function sourceText(message) {
    // Only the visible, native message text. Avoid exporting toolbar labels,
    // edit controls, token counters or hidden state from the message card.
    const nodes = [...message.querySelectorAll('div.whitespace-pre-wrap,div[class*="break-words"],div[class*="overflow-wrap"]')];
    const best = nodes.sort((a,b) => (b.innerText || '').length - (a.innerText || '').length)[0];
    if (best) return clamp(best.innerText || best.textContent || '', 2000);
    const copy = message.cloneNode(true);
    copy.querySelectorAll('button,svg,img,.ds-message-lorebook-button,.ds-message-action-row,[role="menu"]').forEach(n => n.remove());
    return clamp(copy.innerText || copy.textContent || '', 2000);
  }
  function copy(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const box = $('textarea'); box.value = text; document.body.append(box); box.select();
    const ok = document.execCommand('copy'); box.remove(); return Promise.resolve(ok);
  }
  async function showEditor(initial = '') {
    document.getElementById(MODAL)?.remove();
    const id = chatId(); if (!id) return;
    const overlay = $('div','ds-chat-lorebook-overlay'); overlay.id = MODAL;
    const dialog = $('div','ds-chat-lorebook-dialog');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Lorebook draft editor');
    dialog.append($('h2','','Chat Lorebook Manager'),$('p','ds-lb-description','Review and save a private local draft. Nothing will be published or attached automatically.'));
    // Native bot-level attachment route verified against chatbot create-form captures.
    // It is intentionally guidance only: the captures do not establish an API or
    // control for attaching a personal lorebook to somebody else's existing chat.
    const attachHelp = $('details', 'ds-lb-attach-help');
    attachHelp.append($('summary', '', 'How to attach a lorebook to your own chatbot'));
    attachHelp.append($('p', '', 'In SpicyChat’s chatbot editor, open Advanced → Lorebook → Attach Lorebook, choose a lorebook and save the chatbot using SpicyChat’s own controls. Once attached, that area shows Replace Lorebook. This attaches a lorebook to a chatbot, not to an individual conversation; saving an entry draft here does not attach it.'));
    dialog.append(attachHelp);
    const title = field(dialog, 'Entry name (max 50)', 'input', '', 50);
    const keywords = field(dialog, 'Keywords (comma-separated, max 12)', 'input', '', 600);
    const content = field(dialog, 'Content (max 2000)', 'textarea', initial, 2000);
    const book = field(dialog, 'Optional existing lorebook editor URL', 'input', '', 240);
    book.placeholder = 'https://spicychat.ai/lorebook/edit/.../entries';
    const state = $('p','ds-lb-draft-status');state.setAttribute('role','status');dialog.append(state);
    const actions = $('div','ds-lb-draft-actions');
    function add(text, handler) {const b = $('button','',text);b.type='button';b.addEventListener('click', handler);actions.append(b);return b;}
    add('Cancel', () => overlay.remove());
    add('Copy entry', async () => {
      const serialized = `Name: ${clamp(title.value,50)}\nKeywords: ${keywords.value}\nContent: ${content.value}`;
      try { await copy(serialized);state.textContent='Copied. Paste into the native lorebook entry editor.'; } catch { state.textContent='Could not access clipboard; select and copy the fields manually.'; }
    });
    add('Queue in existing lorebook', async () => {
      const raw=book.value.trim();
      let u; try {u=new URL(raw);}catch {state.textContent='Enter a valid existing lorebook editor URL first.';return;}
      const match=u.pathname.match(/^\/lorebook\/edit\/([0-9a-f-]{36})(?:\/entries)?\/?$/i);
      if (!['spicychat.ai','www.spicychat.ai'].includes(u.hostname) || u.protocol !== 'https:' || !match) {
        state.textContent='Enter the editor URL of an existing SpicyChat lorebook.';return;
      }
      const name=clamp(title.value,50), text=clamp(content.value,2000);
      if (!name || !text) {state.textContent='Entry name and content are required.';return;}
      const names=[...new Map(keywords.value.split(',').map(x=>x.trim()).filter(Boolean).map(x=>[x.toLowerCase(),x])).values()].slice(0,12);
      if (!confirm(`Prepare “${name}” for your existing lorebook? The native Add Entry form will be filled for review; QoL will not press Save.`)) return;
      // Open while the click's user activation is still valid; Chrome may block
      // window.open after awaiting asynchronous extension storage.
      const destination=`${u.origin}/lorebook/edit/${match[1]}/entries`;
      const opened=window.open(destination,'_blank','noopener,noreferrer');
      try {
        await new Promise((resolve,reject) => chrome.storage.local.set({[PENDING_KEY]:{
          schema:1, targetId:match[1].toLowerCase(),name,keywords:names,content:text,queuedAt:Date.now()
        }},()=>chrome.runtime.lastError?reject(new Error(chrome.runtime.lastError.message)):resolve()));
        state.textContent='Prepared. Open the editor tab and use Review queued entry to fill the native Add Entry form.';
      } catch(error) {state.textContent='Could not queue the entry. Nothing was submitted: '+String(error?.message||error);}

    });
    add('My Lorebooks', () => {
      // Confirmed native My Creations route; site handles ownership/visibility.
      window.open(`${location.origin}/my-creations/lorebooks`,'_blank','noopener,noreferrer');
    });
    add('Open lorebook editor', () => {
      const raw=book.value.trim();
      let u; try {u=new URL(raw);}catch {state.textContent='Enter a valid existing lorebook editor URL first.';return;}
      if (!['spicychat.ai','www.spicychat.ai'].includes(u.hostname) || u.protocol !== 'https:' ||
          !/^\/lorebook\/edit\/[0-9a-f-]{36}(?:\/entries)?\/?$/i.test(u.pathname)) {
        state.textContent='Only an existing SpicyChat lorebook edit link is accepted.';return;
      }
      window.open(u.href,'_blank','noopener,noreferrer');
    });
    add('Save local draft', async () => {
      const name=clamp(title.value,50), text=clamp(content.value,2000);
      if (!name || !text) {state.textContent='Entry name and content are required.';return;}
      const names = [...new Map(keywords.value.split(',').map(x => x.trim()).filter(Boolean).map(x => [x.toLowerCase(),x])).values()].slice(0,12);
      const record={name,keywords:names,content:text,chatId:id,createdAt:Date.now(),schema:1};
      try {
        const all=await storageGet(); const list=Array.isArray(all[id])?all[id]:[];
        all[id]=[...list,record].slice(-MAX_ENTRIES);
        await storageSet(all);state.textContent=`Saved draft locally (${all[id].length} for this chat). Use Copy entry and the native lorebook editor to publish it.`;
      } catch(error) {state.textContent='Could not save draft: '+String(error?.message||error);}
    });
    add('Load most recent', async () => {
      const list=(await storageGet())[id]||[];
      const last=list.at(-1);
      if (!last) {state.textContent='No draft saved for this chat.';return;}
      title.value=last.name||'';keywords.value=(last.keywords||[]).join(', ');content.value=last.content||'';
      state.textContent='Loaded the most recent draft; edit and save it as a new revision.';
    });
    add('Export chat drafts', async () => {
      const list=(await storageGet())[id]||[];
      if (!list.length) {state.textContent='No saved drafts for this chat.';return;}
      download('spicychat-lorebook-drafts-'+id.slice(0,8)+'.json',JSON.stringify({schema:'dsq-chat-lorebook-drafts/v1',chatId:id,entries:list},null,2));
    });
    dialog.append(actions);overlay.append(dialog);document.body.append(overlay);
    const closeEvent = event => { if (event.key === 'Escape') {overlay.remove();document.removeEventListener('keydown',closeEvent);} };
    document.addEventListener('keydown',closeEvent);
    overlay.addEventListener('click',event=>{if(event.target===overlay)overlay.remove()});
    title.focus();
  }
  function memoryButtons() {
    const manager = document.querySelector('[data-testid="ChatMemoryManagerCapabilityGate"]');
    if (!manager) return;
    const triggers=[...manager.querySelectorAll('button[data-slot="trigger"][aria-haspopup="true"]')].slice(0,100);
    for (const trigger of triggers) {
      let row=trigger.parentElement;
      for (let i=0;row&&row!==manager&&i<7; i++,row=row.parentElement) {
        const text=row.querySelector('div[class*="overflow-wrap"] span');
        if (!text || row.querySelectorAll('button[data-slot="trigger"][aria-haspopup="true"]').length !== 1) continue;
        if (!row.querySelector(':scope > .ds-memory-lorebook-button')) {
          const btn=$('button','ds-memory-lorebook-button','To Lorebook');btn.type='button';btn.title='Save this memory as a lorebook draft';
          btn.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();showEditor(clamp(text.textContent,2000));});
          row.append(btn);
        }
        break;
      }
    }
  }
  function messageButtons() {
    // Only currently loaded message elements, no new history fetching or observers.
    // Capped so large chats do not incur another full-document augmentation pass.
    const messages = [...document.querySelectorAll('[id^="message-"]')].slice(-60);
    for (const msg of messages) {
      if (msg.querySelector('.ds-message-lorebook-button')) continue;
      const toolbar = msg.querySelector('div.flex.justify-between.items-center') || msg;
      const button = $('button','ds-message-lorebook-button','To Lorebook');
      button.type='button';button.title='Create lorebook draft from this message';
      button.addEventListener('click',event => {
        event.preventDefault();event.stopPropagation();showEditor(sourceText(msg));
      });
      toolbar.append(button);
    }
  }
  function chatAction() {
    if (document.getElementById('ds-chat-lorebook-action')) return;
    const header=document.querySelector('a[aria-label="chatbot-profile"]')?.parentElement;
    if (!header) return;
    const button=$('button','ds-chat-lorebook-action','Lorebook draft');button.id='ds-chat-lorebook-action';button.type='button';
    button.addEventListener('click',()=>showEditor());header.append(button);
  }
  let pendingReadInFlight = false;
  let pendingCheckAt = 0;
  function setNativeValue(field, text) {
    if (!field) return;
    const proto=field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
    if(setter) setter.call(field, text); else field.value=text;
    field.dispatchEvent(new Event('input',{bubbles:true}));
    field.dispatchEvent(new Event('change',{bubbles:true}));
  }
  async function reviewPendingEntry(pending, banner) {
    const add=document.querySelector("[data-testid='EntriesCreateHeader-AddEntryButton']");
    if(!add) {banner.title='Native Add Entry is not available on this page.';return;}
    add.click();
    // Wait only in response to the user's explicit button click.
    let name, content;
    for(let i=0;i<20;i++) {
      name=[...document.querySelectorAll('input[name="name"]')].find(el=>el.getClientRects().length);
      content=[...document.querySelectorAll('textarea[name="content"]')].find(el=>el.getClientRects().length);
      if(name && content)break;
      await new Promise(resolve=>setTimeout(resolve,110));
    }
    if(!name || !content) {banner.title='Could not find the native entry editor.';return;}
    setNativeValue(name,clamp(pending.name,50));
    setNativeValue(content,clamp(pending.content,2000));
    const form=content.closest('form')||content.parentElement;
    const keywordField=[...(form?.querySelectorAll('input')||[])].find(el=>el!==name && /keyword|tag/i.test(el.placeholder||''));
    if(keywordField) {
      for(const keyword of (pending.keywords||[]).slice(0,12)) {
        setNativeValue(keywordField,clamp(keyword,80));
        keywordField.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
        keywordField.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
      }
    }
    // Clear only after native form fields were found and filled. User controls Save.
    chrome.storage.local.remove(PENDING_KEY,()=>{});
    banner.textContent='Draft filled. Review the native fields and press Save yourself.';
  }
  async function editorHandoff() {
    const route=location.pathname.match(/^\/lorebook\/edit\/([0-9a-f-]{36})\/entries\/?$/i);
    if(!route || document.getElementById('ds-chat-lorebook-pending')) return;
    if(pendingReadInFlight || Date.now()-pendingCheckAt<3500) return;
    pendingReadInFlight=true;pendingCheckAt=Date.now();
    try {
      const pending=await new Promise(resolve=>chrome.storage.local.get([PENDING_KEY],v=>resolve(v?.[PENDING_KEY])));
      if(!pending || pending.schema!==1 || pending.targetId!==route[1].toLowerCase() || Date.now()-pending.queuedAt>30*60*1000) return;
      const anchor=document.querySelector("[data-testid='EntriesCreateHeader-AddEntryButton']")?.parentElement;
      if(!anchor)return;
      const banner=$('div','ds-chat-lorebook-pending');banner.id='ds-chat-lorebook-pending';
      banner.append($('span','','Queued lorebook entry: '+clamp(pending.name,50)));
      const review=$('button','','Review queued entry');review.type='button';
      review.addEventListener('click',()=>reviewPendingEntry(pending,banner));banner.append(review);
      const discard=$('button','','Discard');discard.type='button';
      discard.addEventListener('click',()=>chrome.storage.local.remove(PENDING_KEY,()=>banner.remove()));banner.append(discard);
      anchor.append(banner);
    } finally {pendingReadInFlight=false;}
  }
  function cleanup() {
    document.querySelectorAll('.ds-memory-lorebook-button,.ds-message-lorebook-button,#ds-chat-lorebook-action').forEach(el=>el.remove());
    document.getElementById(MODAL)?.remove();
  }
  DS.applyChatLorebookManager=function applyChatLorebookManager() {
    if (!DS.state?.settings?.enabled || !DS.state?.settings?.enableChatLorebookManager) {cleanup();return;}
    if (/^\/lorebook\/edit\/[0-9a-f-]{36}\/entries\/?$/i.test(location.pathname)) {
      editorHandoff().catch(()=>{}); return;
    }
    if (!chatId()) {cleanup();return;}
    chatAction();memoryButtons();messageButtons();
  };
})();
}
