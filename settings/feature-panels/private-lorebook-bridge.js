// Dedicated Custom Lite Settings ownership for the optional private Lorebook bridge.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes('private-lorebook-bridge')) return;
  const host=document.getElementById('ds-feature-panel-private-lorebook-bridge');
  if (!host)return;
  const section=document.createElement('section');section.className='card';
  const h=document.createElement('h2');h.textContent='Private Lorebook Bridge';section.append(h);
  const p=document.createElement('p');p.className='hint';p.textContent='Only works with a private bot you own and its attached private Lorebook. The shared private Archive stores older facts separately; QoL never attaches it to any bot. Context Keeper works without this.';section.append(p);
  const experimental=document.createElement('p');experimental.className='hint';
  experimental.textContent='Experimental — still needs testing. Keep backups and check changes in SpicyChat. Updating or deleting existing native entries and remote Archive cleanup are still manual.';
  section.append(experimental);
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
  checkbox('enablePrivateLorebookBridge','Enable private Lorebook connection (OFF by default)');
  select('privateLorebookStorageMode','Where should old facts be stored?',[['local','Local browser storage'],['archive','Shared private Archive (never attached by QoL)'],['hybrid','Both local storage and private Archive']]);
  const idLabel=document.createElement('label');idLabel.textContent='Shared Archive Lorebook ID (same Archive for all conversations)';
  const idField=document.createElement('input');idField.id='privateLorebookArchiveId';idField.placeholder='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';idField.maxLength=36;
  idLabel.append(idField);section.append(idLabel);
  const setup=document.createElement('button');setup.type='button';setup.id='dsSetupPrivateArchiveLorebook';
  setup.textContent='Set up private Archive Lorebook';
  const setupStatus=document.createElement('p');setupStatus.className='hint';setupStatus.setAttribute('role','status');
  setupStatus.textContent='Creates or reuses a private Archive with the QoL picture. QoL won\'t attach it to a bot.';
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

  select('privateLorebookSyncMode','When should Archive data sync?',[['manual','Only when I choose'],['on-change','When approved facts change (needs an Archive)'],['off','Do not sync to Archive']]);
  checkbox('privateLorebookAllowArchiveAutoSync','Allow uploading approved Context Keeper facts to my private Archive automatically');
  const cleanup=checkbox('privateLorebookArchiveCleanup','Remove redundant Archive copies after confirmed promotion (not available yet)');cleanup.disabled=true;
  select('privateLorebookPromotionPolicy','Which facts can become shared bot lore?',[['shared','Only facts that apply to every chat with this bot'],['both','Allow chat-specific facts (with warning)'],['manual','Manual review only']]);
  checkbox('privateLorebookRequireReview','Review changes in SpicyChat before saving (recommended)');
  const autoCreate=checkbox('privateLorebookAllowAutoCreate','Allow creating new native entries without review (risky)');
  autoCreate.disabled=false;
  const previewNote=document.createElement('p');previewNote.className='hint';
  previewNote.textContent='You can review entries in SpicyChat\'s editor. Direct creation is experimental and checks that the bot and Lorebook are yours. If a save is uncertain, QoL won\'t retry it blindly. Editing or deleting existing native entries is still manual.';
  section.append(previewNote);
  const warn=document.createElement('p');warn.className='hint';warn.textContent='Without review, incorrect details could affect every chat with that bot. Ownership and duplicate checks still apply. Existing entries won\'t be edited or deleted automatically.';section.append(warn);
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
