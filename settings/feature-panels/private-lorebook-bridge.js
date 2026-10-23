// Dedicated Custom Lite Settings ownership for the optional private Lorebook bridge.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes('private-lorebook-bridge')) return;
  const host=document.getElementById('ds-feature-panel-private-lorebook-bridge');
  if (!host)return;
  const section=document.createElement('section');section.className='card';
  const h=document.createElement('h2');h.textContent='Private Lorebook Bridge';section.append(h);
  const p=document.createElement('p');p.className='hint';p.textContent='Only your own private bot and its one attached private Lorebook. The optional shared private Archive Lorebook is only for storing history and is never connected to a bot by QoL. Context Keeper remains standalone.';section.append(p);
  function checkbox(id,label) {
    const row=document.createElement('label');row.className='row';
    const input=document.createElement('input');input.id=id;input.type='checkbox';
    const span=document.createElement('span');span.textContent=label;row.append(input,span);section.append(row);return input;
  }
  function select(id,label,choices) {
    const row=document.createElement('label');row.textContent=label+' ';
    const input=document.createElement('select');input.id=id;
    for(const [key,description] of choices){const option=document.createElement('option');option.value=key;option.textContent=description;input.append(option);}row.append(input);section.append(row);return input;
  }
  checkbox('enablePrivateLorebookBridge','Enable Private Lorebook Bridge (off by default)');
  select('privateLorebookStorageMode','Archive storage backend',[['local','Browser IndexedDB'],['archive','Private Archive Lorebook (not connected to bots)'],['hybrid','Hybrid (local + private Archive Lorebook)']]);
  const idLabel=document.createElement('label');idLabel.textContent='Shared private Archive Lorebook ID (optional; one across all conversations)';
  const idField=document.createElement('input');idField.id='privateLorebookArchiveId';idField.placeholder='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';idField.maxLength=36;
  idLabel.append(idField);section.append(idLabel);
  const setup=document.createElement('button');setup.type='button';setup.id='dsSetupPrivateArchiveLorebook';
  setup.textContent='Setup Private Archive Lorebook';
  const setupStatus=document.createElement('p');setupStatus.className='hint';setupStatus.setAttribute('role','status');
  setupStatus.textContent='Creates or reuses one private Archive Lorebook with the actual QoL picture. QoL never connects it to a bot.';
  section.append(setup,setupStatus);
  const archiveSettingsKey='dsSettingV1:privateLorebookArchiveId';
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local' && changes[archiveSettingsKey]?.newValue) {
      idField.value=String(changes[archiveSettingsKey].newValue).slice(0,36);
      idField.dispatchEvent(new Event('change',{bubbles:true}));
      setupStatus.textContent='Private Archive Lorebook configured successfully.';
    }
  });
  setup.addEventListener('click',async()=>{
    const current=idField.value.trim();
    if(current && !confirm('An Archive Lorebook ID is already configured. Check for an existing private archive instead of creating a duplicate?'))return;
    if(!confirm('Allow QoL to create or reuse one private Archive Lorebook with the actual QoL picture? QoL will never connect it to a bot.'))return;
    setup.disabled=true;setupStatus.textContent='Opening SpicyChat for secure Archive creation…';
    try {
      const token=crypto.randomUUID();
      const job={schema:1,token,createdAt:Date.now(),status:'ready',name:'SpicyChat QoL Archive',
        description:'Private archive for conversation history stored by SpicyChat QoL.'};
      await new Promise((resolve,reject)=>chrome.storage.local.set({dsQolPrivateArchiveSetupV1:job},()=>
        chrome.runtime.lastError?reject(new Error(chrome.runtime.lastError.message)):resolve()));
      chrome.tabs.create({url:'https://spicychat.ai/lorebook/create?dsQolArchiveSetup='+encodeURIComponent(token)},tab=>{
        if(chrome.runtime.lastError || !tab?.id){setupStatus.textContent='Could not open SpicyChat: '+(chrome.runtime.lastError?.message||'unknown error');}
        else setupStatus.textContent='SpicyChat opened. QoL will securely upload its picture and create the private Archive.';
        setup.disabled=false;
      });
    } catch(err) {setupStatus.textContent='Archive setup failed: '+String(err?.message||err);setup.disabled=false;}
  });

  select('privateLorebookSyncMode','Synchronization',[['manual','Manual only'],['on-change','On relevant changes (requires configured archive)'],['off','No archive synchronization']]);
  checkbox('privateLorebookAllowArchiveAutoSync','I approve automatic uploads of newly approved Context Keeper details to my configured private Archive Lorebook');
  const cleanup=checkbox('privateLorebookArchiveCleanup','Future cleanup preference: remove redundant archived data after verified promotion (not active yet)');cleanup.disabled=true;
  select('privateLorebookPromotionPolicy','Native promotion policy',[['shared','Shared bot canon only'],['both','Allow conversation facts with explicit warning'],['manual','Manual review only']]);
  checkbox('privateLorebookRequireReview','Require review in the native Lorebook editor (recommended)');
  const autoCreate=checkbox('privateLorebookAllowAutoCreate','Allow unreviewed native entry CREATION when review is off (at your own risk)');
  autoCreate.disabled=false;
  const previewNote=document.createElement('p');previewNote.className='hint';
  previewNote.textContent='Reviewed entry handoff is available. Direct entry creation is experimental: it runs only with an available authenticated extension session, verifies private ownership and readback, and will not retry uncertain writes. Native existing-entry changes and deletion remain manual.';
  section.append(previewNote);
  const warn=document.createElement('p');warn.className='hint';warn.textContent='Unreviewed mode can introduce incorrect canon in every chat with the same bot. Private ownership, association checks, recorded local revisions and duplicate prevention remain mandatory. Existing-entry updates and deletion are NOT automated in this build.';section.append(warn);
  const readers=window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders=window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  const boolKeys=['enablePrivateLorebookBridge','privateLorebookArchiveCleanup','privateLorebookRequireReview','privateLorebookAllowAutoCreate','privateLorebookAllowArchiveAutoSync'];
  for(const key of boolKeys) {
    readers[key]=()=>!!document.getElementById(key)?.checked;
    loaders[key]=value=>{ const element=document.getElementById(key);if(element)element.checked=value[key]===true;};
  }
  const choices={privateLorebookStorageMode:['local','archive','hybrid'],privateLorebookSyncMode:['manual','on-change','off'],privateLorebookPromotionPolicy:['shared','both','manual']};
  const defaults={privateLorebookStorageMode:'hybrid',privateLorebookSyncMode:'on-change',privateLorebookPromotionPolicy:'shared'};
  for(const [key,values] of Object.entries(choices)) {
    readers[key]=()=>values.includes(document.getElementById(key)?.value)?document.getElementById(key).value:defaults[key];
    loaders[key]=data=>{const el=document.getElementById(key);if(el)el.value=values.includes(data[key])?data[key]:defaults[key];};
  }
  readers.privateLorebookArchiveId=()=>String(document.getElementById('privateLorebookArchiveId')?.value||'').trim().toLowerCase().slice(0,36);
  loaders.privateLorebookArchiveId=data=>{const el=document.getElementById('privateLorebookArchiveId');if(el)el.value=String(data.privateLorebookArchiveId||'').slice(0,36);};
  host.replaceWith(section);
})();
