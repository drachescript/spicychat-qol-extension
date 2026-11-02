// Independent Custom Lite Settings owner; new feature starts OFF.
(() => {
  'use strict';
  const profile=window.__DSQ_BUILD_PROFILE__;
  if(profile?.generated && Array.isArray(profile.features) && !profile.features.includes('chat-smart-folders'))return;
  const host=document.getElementById('ds-feature-panel-chat-smart-folders');if(!host)return;
  const card=document.createElement('div');card.className='card';card.style.margin='8px 0';
  const heading=document.createElement('h3');heading.textContent='Smart Conversation Folders';card.append(heading);
  const explain=document.createElement('p');explain.className='hint';explain.textContent='Manually preview folder suggestions from chat metadata. Your existing folders stay untouched until you apply changes.';card.append(explain);
  function checkbox(id,label) {
    const wrapper=document.createElement('label');wrapper.className='row';
    const input=document.createElement('input');input.type='checkbox';input.id=id;
    const title=document.createElement('span');title.textContent=label;
    wrapper.append(input,title);card.append(wrapper);
    (window.__DSQ_FEATURE_SETTINGS_READERS__ ||= {})[id]=()=>input.checked;
    (window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= {})[id]=data=>input.checked===!!data[id]?null:(input.checked=!!data[id]);
  }
  checkbox('enableChatSmartFolders','Enable Smart Conversation Folders (requires Conversation folders)');
  checkbox('smartChatFolderDailyRefresh','Refresh every 24 hours while /chats is open (after first manual preview)');
  checkbox('smartChatFolderFetchBotTags','Look up missing bot tags (extra API requests)');
  const label=document.createElement('label');label.textContent='Persona/tag → folder rules (one per line)';
  const rules=document.createElement('textarea');rules.id='smartChatFolderRules';rules.rows=4;rules.placeholder='persona: Your persona name or ID => Persona folder\ntag: Fantasy => Fantasy';
  label.append(rules);card.append(label);
  const note=document.createElement('p');note.className='hint';note.textContent='Rules use saved persona and bot-tag metadata, never chat messages. Persona IDs are safest. After changing rules, preview and apply them again before auto-refresh resumes.';card.append(note);
  (window.__DSQ_FEATURE_SETTINGS_READERS__ ||= {}).smartChatFolderRules=()=>String(rules.value||'').slice(0,7000);
  (window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= {}).smartChatFolderRules=data=>{rules.value=String(data.smartChatFolderRules||'').slice(0,7000);};
  host.replaceWith(card);
})();
