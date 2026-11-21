// Separately owned, manual Research Export settings. No runtime requests from Settings.
(() => {
  'use strict';
  const profile=window.__DSQ_BUILD_PROFILE__;
  if(profile?.generated && Array.isArray(profile.features) && !profile.features.includes('bulk-chat-research'))return;
  const host=document.getElementById('ds-feature-panel-bulk-chat-research');if(!host)return;
  const section=document.createElement('section');section.className='card';
  const title=document.createElement('h2');title.textContent='Bulk Chat, Memory & Character Research Export';section.append(title);
  const label=document.createElement('label');label.className='row';
  const checkbox=document.createElement('input');checkbox.id='showBulkChatResearchExport';checkbox.type='checkbox';
  const span=document.createElement('span');span.textContent='Enable bulk research exports';label.append(checkbox,span);section.append(label);
  const note=document.createElement('p');note.className='hint';note.textContent='Export the newest 50 bots by default, or select more/all. Every bot is saved once in characters/<bot-id>.json, with exposed character fields, exact tags, permitted linked Lorebooks, source and per-field availability. Conversations reference this file; native Memories and histories remain unchanged. Start / Resume reuses verified unchanged chats and downloads changed chats only. Keep older ZIP parts; Fresh rebuilds a standalone archive. Research records can also sync through GitHub Backup if you enable that category.';section.append(note);
  const launch=document.createElement('button');launch.type='button';launch.textContent='Open research export in a separate tab';
  launch.addEventListener('click',()=>{ if(!checkbox.checked){alert('Enable this feature and save Settings before opening the exporter.');return;}
    window.open('https://spicychat.ai/chats?ds-research-export=1','_blank','noopener'); });
  section.append(launch);host.replaceWith(section);
  (window.__DSQ_FEATURE_SETTINGS_READERS__||={}).showBulkChatResearchExport=()=>checkbox.checked;
  (window.__DSQ_FEATURE_SETTINGS_LOADERS__||={}).showBulkChatResearchExport=values=>{checkbox.checked=values.showBulkChatResearchExport===true;};
})();
