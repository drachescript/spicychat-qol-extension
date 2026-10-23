// Independent Custom Lite Settings owner; new feature starts OFF.
(() => {
  'use strict';
  const profile=window.__DSQ_BUILD_PROFILE__;
  if(profile?.generated && Array.isArray(profile.features) && !profile.features.includes('chat-smart-folders'))return;
  const host=document.getElementById('ds-feature-panel-chat-smart-folders');if(!host)return;
  const card=document.createElement('div');card.className='card';card.style.margin='8px 0';
  const heading=document.createElement('h3');heading.textContent='Smart Chat Folders';card.append(heading);
  const explain=document.createElement('p');explain.className='hint';explain.textContent='Initial scan is manual from /chats. QoL scans conversation metadata in small pages, previews changes and preserves your manual folders. Missing persona or tag data is never guessed.';card.append(explain);
  function checkbox(id,label) {
    const wrapper=document.createElement('label');wrapper.className='row';
    const input=document.createElement('input');input.type='checkbox';input.id=id;
    const title=document.createElement('span');title.textContent=label;
    wrapper.append(input,title);card.append(wrapper);
    (window.__DSQ_FEATURE_SETTINGS_READERS__ ||= {})[id]=()=>input.checked;
    (window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= {})[id]=data=>input.checked===!!data[id]?null:(input.checked=!!data[id]);
  }
  checkbox('enableChatSmartFolders','Enable Smart Chat Folders (OFF by default; requires Chat folders)');
  checkbox('smartChatFolderDailyRefresh','Optional 24-hour refresh when /chats is open (OFF by default; only after a manual preview is applied)');
  checkbox('smartChatFolderFetchBotTags','Fetch missing bot tags in small bounded batches (OFF by default; extra API requests)');
  const label=document.createElement('label');label.textContent='Persona/tag → folder rules (one per line)';
  const rules=document.createElement('textarea');rules.id='smartChatFolderRules';rules.rows=4;rules.placeholder='persona: Your persona name or ID => Persona folder\ntag: Fantasy => Fantasy';
  label.append(rules);card.append(label);
  const note=document.createElement('p');note.className='hint';note.textContent='Uses the conversation’s currently saved persona association, not a history of persona switches. Persona names work if QoL has saved that persona locally; exact IDs are safer. Tag rules use tags returned by conversation metadata or optional bot-tag lookup. Scans never read chat messages. Auto-refresh checks only when this page is open and will not run after rules change until you manually preview and apply them.';card.append(note);
  (window.__DSQ_FEATURE_SETTINGS_READERS__ ||= {}).smartChatFolderRules=()=>String(rules.value||'').slice(0,7000);
  (window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= {}).smartChatFolderRules=data=>{rules.value=String(data.smartChatFolderRules||'').slice(0,7000);};
  host.replaceWith(card);
})();
