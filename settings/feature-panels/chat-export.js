(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("chat-export")) return;
  const host = document.getElementById('ds-feature-panel-chat-export');
  if (!host) return;
  const make = entry => {
    if (typeof entry === 'string') return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card"},"\n",["h2",{},"Chat export"],"\n",["label",{"class":"row"},["input",{"id":"showChatExportButton","type":"checkbox"}],["span",{},"Show Copy / Export chat buttons on chat pages"]],"\n",["p",{"class":"hint"},"Copy / Export loads full chat history through the API without rendering older messages in the page."],"\n",["label",{"class":"row"},["input",{"id":"chatExportIncludeBotInfo","type":"checkbox"}],["span",{},"Include available bot info"]],"\n",["label",{"class":"row"},["input",{"id":"chatExportIncludeRulebook","type":"checkbox"}],["span",{},"Include current Rulebook meter snapshot (only visible information, not full history)"]],"\n",["label",{"class":"row"},["input",{"id":"chatExportIncludeRulebookState","type":"checkbox"}],["span",{},"Include Rulebook state (Story Moments / Story Time) from currently mounted chat status updates"]],"\n",["label",{"class":"row"},["input",{"id":"chatExportIncludeOocDirectives","type":"checkbox"}],["span",{},"Include OOC and directive notes"]],"\n",["label",{"class":"row"},["input",{"id":"chatExportIncludeGenerationDetails","type":"checkbox"}],["span",{},"Include captured timestamps/model/generation details when available"]],"\n",["label",{"class":"row"},["input",{"id":"chatExportNumberMessages","type":"checkbox"}],["span",{},"Number exported messages"]],"\n",["label",{"class":"row"},["input",{"id":"chatExportIncludeAvatars","type":"checkbox"}],["span",{},"Include avatar links in HTML/JSON exports"]],"\n",["label",{"class":"row"},["input",{"id":"chatExportIncludeImageLinks","type":"checkbox"}],["span",{},"Include message image links when available"]],"\n",["label",{},"Default format",["select",{"id":"chatExportDefaultFormat"},["option",{"value":"text"},"Plain text"],["option",{"value":"markdown"},"Markdown"],["option",{"value":"html"},"HTML archive"],["option",{"value":"json"},"JSON backup"]]],"\n",["label",{},"Default HTML layout",["select",{"id":"chatExportHtmlLayout"},["option",{"value":"bubbles"},"Match current chat appearance"],["option",{"value":"transcript"},"Clean transcript"]]],"\n",["p",{"class":"hint"},"Use your current chat’s colors and layout with API-loaded message history, or choose a clean transcript. The slower page fallback is under Advanced."],"\n"]));
  // Explicit local maintenance; no automatic enumeration at Settings startup.
  const section=document.getElementById('showChatExportButton')?.closest('section');
  if(section){
    const box=document.createElement('div');box.className='sub-card';
    const title=document.createElement('h3');title.textContent='Saved export captures';
    const hint=document.createElement('p');hint.className='hint';hint.textContent='For fresh benchmarks or freeing local storage. This only clears Chat Export checkpoints, not native chats, research exports, downloaded files or other QoL data.';
    const buttons=document.createElement('div');buttons.className='button-row';
    const check=document.createElement('button');check.type='button';check.textContent='Check saved exports';
    const clear=document.createElement('button');clear.type='button';clear.textContent='Clear all saved exports…';
    const status=document.createElement('p');status.className='hint';status.setAttribute('role','status');
    const call=(action,extra={})=>new Promise((resolve,reject)=>{
      let finished=false;const done=(r,error)=>{if(finished)return;finished=true;clearTimeout(timer);if(error||!r?.ok)reject(Error(error||r?.error||'Export storage unavailable'));else resolve(r);};
      const timer=setTimeout(()=>done(null,'Export storage timed out. Check saved exports again to verify the outcome.'),30000);
      try{const ret=chrome.runtime.sendMessage({type:'DS_CHAT_EXPORT_CHECKPOINT',action,...extra},r=>done(r,chrome.runtime.lastError?.message));if(ret?.then)ret.then(r=>done(r),e=>done(null,e?.message));}catch(e){done(null,e?.message);}
    });
    async function run(remove){
      check.disabled=clear.disabled=true;status.textContent='Checking local export captures…';
      try{
        const r=await call('settings-overview');
        const counts=`${r.captures.toLocaleString()} captures · ${r.pages.toLocaleString()} pages · ${r.messages.toLocaleString()} saved unique rows (sum across captures).`;
        status.textContent=counts+(r.active?' An export may still be active. Stop it before clearing.':'');
        if(!remove||r.active||(!r.captures&&!r.pages))return;
        if(!confirm(`Clear ALL local Chat Export checkpoints?\n\n${counts}\n\nFuture exports must fetch again. Native conversations, downloaded files and other QoL data are unchanged.`))return;
        const result=await call('settings-clear',{token:r.token});
        status.textContent=`Cleared ${result.captures.toLocaleString()} saved captures and ${result.pages.toLocaleString()} pages. Close old export dialogs and reopen Export to benchmark a fresh capture.`;
      }catch(error){status.textContent=String(error?.message||error);}
      finally{check.disabled=clear.disabled=false;}
    }
    check.addEventListener('click',()=>run(false));clear.addEventListener('click',()=>run(true));
    buttons.append(check,clear);box.append(title,hint,buttons,status);section.append(box);
  }
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["showChatExportButton"] = () => checked("showChatExportButton");
  loaders["showChatExportButton"] = settings => { setChecked("showChatExportButton", settings.showChatExportButton); };
  readers["chatExportIncludeBotInfo"] = () => checked("chatExportIncludeBotInfo");
  loaders["chatExportIncludeBotInfo"] = settings => { setChecked("chatExportIncludeBotInfo", !!settings.chatExportIncludeBotInfo); };
  readers["chatExportIncludeRulebook"] = () => checked("chatExportIncludeRulebook");
  loaders["chatExportIncludeRulebook"] = settings => { setChecked("chatExportIncludeRulebook", !!settings.chatExportIncludeRulebook); };
  readers["chatExportIncludeRulebookState"] = () => checked("chatExportIncludeRulebookState");
  loaders["chatExportIncludeRulebookState"] = settings => { setChecked("chatExportIncludeRulebookState", settings.chatExportIncludeRulebookState === true); };
  readers["chatExportIncludeOocDirectives"] = () => checked("chatExportIncludeOocDirectives");
  loaders["chatExportIncludeOocDirectives"] = settings => { setChecked("chatExportIncludeOocDirectives", !!settings.chatExportIncludeOocDirectives); };
  readers["chatExportIncludeGenerationDetails"] = () => checked("chatExportIncludeGenerationDetails");
  loaders["chatExportIncludeGenerationDetails"] = settings => { setChecked("chatExportIncludeGenerationDetails", settings.chatExportIncludeGenerationDetails !== false); };
  readers["chatExportNumberMessages"] = () => checked("chatExportNumberMessages");
  loaders["chatExportNumberMessages"] = settings => { setChecked("chatExportNumberMessages", settings.chatExportNumberMessages !== false); };
  readers["chatExportIncludeAvatars"] = () => checked("chatExportIncludeAvatars");
  loaders["chatExportIncludeAvatars"] = settings => { setChecked("chatExportIncludeAvatars", settings.chatExportIncludeAvatars !== false); };
  readers["chatExportIncludeImageLinks"] = () => checked("chatExportIncludeImageLinks");
  loaders["chatExportIncludeImageLinks"] = settings => { setChecked("chatExportIncludeImageLinks", settings.chatExportIncludeImageLinks === true); };
  readers["chatExportDefaultFormat"] = () => value("chatExportDefaultFormat", "text");
  loaders["chatExportDefaultFormat"] = settings => { setValue("chatExportDefaultFormat", settings.chatExportDefaultFormat || "text"); };
  readers["chatExportHtmlLayout"] = () => value("chatExportHtmlLayout", "bubbles");
  loaders["chatExportHtmlLayout"] = settings => { setValue("chatExportHtmlLayout", settings.chatExportHtmlLayout || "bubbles"); };
})();
