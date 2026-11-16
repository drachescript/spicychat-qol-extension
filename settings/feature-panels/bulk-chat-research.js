// Separately owned, manual Research Export settings. No runtime requests from Settings.
(() => {
  'use strict';
  const profile=window.__DSQ_BUILD_PROFILE__;
  if(profile?.generated && Array.isArray(profile.features) && !profile.features.includes('bulk-chat-research'))return;
  const host=document.getElementById('ds-feature-panel-bulk-chat-research');if(!host)return;
  const section=document.createElement('section');section.className='card';
  const title=document.createElement('h2');title.textContent='Bulk Chat & Memory Research Export';section.append(title);
  const label=document.createElement('label');label.className='row';
  const checkbox=document.createElement('input');checkbox.id='showBulkChatResearchExport';checkbox.type='checkbox';
  const span=document.createElement('span');span.textContent='Enable bulk research exports';label.append(checkbox,span);section.append(label);
  const note=document.createElement('p');note.className='hint';note.textContent='Export the latest 50 bots by default, choose a larger number, or scan all bots. Includes each bot’s individual conversations and native Memories in verified ZIP parts. You can cancel and resume. Nothing is uploaded.';section.append(note);
  const launch=document.createElement('button');launch.type='button';launch.textContent='Open research export in a separate tab';
  launch.addEventListener('click',()=>{ if(!checkbox.checked){alert('Enable this feature and save Settings before opening the exporter.');return;}
    window.open('https://spicychat.ai/chats?ds-research-export=1','_blank','noopener'); });
  section.append(launch);host.replaceWith(section);
  (window.__DSQ_FEATURE_SETTINGS_READERS__||={}).showBulkChatResearchExport=()=>checkbox.checked;
  (window.__DSQ_FEATURE_SETTINGS_LOADERS__||={}).showBulkChatResearchExport=values=>{checkbox.checked=values.showBulkChatResearchExport===true;};
})();
