// Feature-owned Archive Blocking Presets Settings. Catalog is fetched only on
// explicit opt-in. Native blocks, Smart Filter and Community Themes untouched.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes('archive-blocking-presets')) return;
  const host = document.getElementById('ds-feature-panel-archive-blocking-presets');
  if (!host) return;
  host.className = 'sub-card';
  const element = (tag,attrs={},label='') => {
    const node = document.createElement(tag);
    for (const [key,value] of Object.entries(attrs)) {
      if (key === 'className') node.className = value;
      else if (key === 'checked') node.checked = !!value;
      else if (key === 'value') node.value = value;
      else node.setAttribute(key,value);
    }
    if (label) node.textContent = label;
    return node;
  };
  host.append(element('h3',{},'Archive Blocking Presets (optional)'));
  const enabledLabel = element('label',{className:'row'});
  const enabled = element('input',{id:'archiveBlockingPresetsEnabled',type:'checkbox'});
  enabledLabel.append(enabled,element('span',{},'Hide matching bot names/titles using selected Archive presets'));
  host.append(enabledLabel);
  host.append(element('p',{className:'hint'},'Separate from Smart Filters and Community Themes. All presets start OFF. Only public bot names and titles are matched; descriptions, greetings, tags and supporting character mentions are ignored. Hides are reversible — never native Blocks, dislikes, Less Like This or saved ratings.'));
  const status = element('p',{className:'hint',id:'archiveBlockingPresetsStatus','aria-live':'polite'},'Enable to load the public preset catalog.');
  const groupsHost = element('div',{id:'archiveBlockingPresetsControls'});
  const stateInput = element('input',{id:'archiveBlockingPresetsSelection',type:'hidden'});
  host.append(status,stateInput,groupsHost);
  const empty = () => ({franchises:{},characters:[],groups:[],themes:[]});
  let selection = empty(), catalog = null, pending = null;
  const arr = value => Array.isArray(value) ? [...new Set(value.filter(v=>typeof v==='string'))].slice(0,500) : [];
  const normalize = source => ({
    franchises: source?.franchises && typeof source.franchises === 'object' && !Array.isArray(source.franchises) ?
      Object.fromEntries(Object.entries(source.franchises).slice(0,250).filter(([id,cfg])=>id.length<100 && cfg && typeof cfg==='object')
        .map(([id,cfg])=>[id,{enabled:cfg.enabled===true,
          mode:['all','keep-female','keep-male','custom'].includes(cfg.mode)?cfg.mode:'all',
          keepGenders:arr(cfg.keepGenders).filter(x=>['male','female','nonbinary'].includes(x)),
          keepCharacterIds:arr(cfg.keepCharacterIds)}])) : {},
    characters:arr(source?.characters),groups:arr(source?.groups),themes:arr(source?.themes)
  });
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers.archiveBlockingPresetsEnabled = () => enabled.checked;
  readers.archiveBlockingPresetsSelection = () => normalize(selection);
  const changed = () => {
    stateInput.value = JSON.stringify(selection);
    stateInput.dispatchEvent(new Event('change',{bubbles:true}));
  };
  function choose(id,group,active) {
    const choices = new Set(selection[group]);
    if (active) choices.add(id); else choices.delete(id);
    selection[group] = [...choices]; changed();
  }
  const labelCheckbox = (name,active,onChange) => {
    const wrap = element('label',{className:'row'});
    const input = element('input',{type:'checkbox'}); input.checked=!!active;
    input.addEventListener('change',()=>onChange(input.checked));
    wrap.append(input,element('span',{},name)); return wrap;
  };
  function render() {
    groupsHost.replaceChildren();
    if (!enabled.checked || !catalog) return;
    const addSection = (heading, items, factory) => {
      const section = element('div',{className:'sub-card'});
      section.append(element('h4',{},heading));
      for (const item of items) section.append(factory(item));
      groupsHost.append(section);
    };
    addSection('Franchises / games / anime / movies',catalog.presets.filter(p=>p.kind==='franchise'),preset=>{
      const box=element('div',{className:'sub-card'});
      const id=preset.id;
      const cfg=selection.franchises[id] || {enabled:false,mode:'all',keepGenders:[],keepCharacterIds:[]};
      const detail=element('div'); detail.hidden=!cfg.enabled;
      const apply=(patch)=>{
        selection.franchises[id]={...cfg,...selection.franchises[id],...patch};
        changed();
      };
      box.append(labelCheckbox(`${preset.name} (${preset.category || 'franchise'})`,cfg.enabled,active=>{
        apply({enabled:active}); detail.hidden=!active;
      }));
      const modeLabel=element('label'); modeLabel.append(element('span',{},'Hide mode '));
      const mode=element('select');
      for (const [value,text] of [['all','Hide all matching'],['keep-female','Hide male characters (keep female)'],['keep-male','Hide female characters (keep male)'],['custom','Custom keep exceptions']]) {
        const option=element('option',{value},text);mode.append(option);
      }
      mode.value=cfg.mode;
      const custom=element('div');
      mode.addEventListener('change',()=>{apply({mode:mode.value}); renderCustom();});
      modeLabel.append(mode);detail.append(modeLabel,custom);
      const renderCustom=()=>{
        custom.replaceChildren();
        const current=selection.franchises[id] || cfg;
        if (mode.value==='custom') {
          custom.append(element('p',{className:'hint'},'Only explicitly recognized characters outside these keep exceptions are hidden. Unknown, group-only, mixed and gender-swapped titles stay visible.'));
          for (const gender of ['female','male','nonbinary'])
            custom.append(labelCheckbox(`Keep ${gender} characters`,arr(current.keepGenders).includes(gender),on=>{
              const set=new Set(arr((selection.franchises[id]||cfg).keepGenders));
              if(on)set.add(gender);else set.delete(gender);
              apply({keepGenders:[...set]});
            }));
        } else custom.append(element('p',{className:'hint'},mode.value==='all'?
          'Every strong franchise, recognized character or group match hides, including unknown main characters.':
          'Only a single confidently identified canonical character of the unwanted gender hides.'));
        const chars = (catalog.characters||[]).filter(x=>x.franchiseId===preset.franchiseId);
        if (!chars.length) return;
        const exceptions=element('details');
        exceptions.append(element('summary',{},'Keep individual characters (exceptions)'));
        for (const character of chars)
          exceptions.append(labelCheckbox(`${character.name} (${character.gender})`,arr(current.keepCharacterIds).includes(character.id),on=>{
            const set=new Set(arr((selection.franchises[id]||cfg).keepCharacterIds));
            if(on)set.add(character.id);else set.delete(character.id);
            apply({keepCharacterIds:[...set]});
          }));
        custom.append(exceptions);
      };
      renderCustom();box.append(detail);return box;
    });
    addSection('Individual characters',catalog.characters||[],item=>
      labelCheckbox(`${item.name} (${item.gender})`,selection.characters.includes(item.id),on=>choose(item.id,'characters',on)));
    addSection('Groups',catalog.groups||[],item=>
      labelCheckbox(item.name,selection.groups.includes(item.id),on=>choose(item.id,'groups',on)));
    addSection('Title themes',catalog.presets.filter(p=>p.kind==='theme'),item=>
      labelCheckbox(item.name,selection.themes.includes(item.id),on=>choose(item.id,'themes',on)));
    groupsHost.append(element('p',{className:'hint'},'Archive discovery suggestions are review-only and never automatically added to this list. Hover a dimmed bot card or enable QoL card diagnostics to see why it was hidden. Changes save with the normal QoL Settings autosave.'));
  }
  async function loadCatalog() {
    if (!enabled.checked || pending) return pending;
    if (catalog) { render(); return; }
    status.textContent='Loading public Archive preset catalog…';
    pending=chrome.runtime.sendMessage({type:'DS_ARCHIVE_BLOCK_PRESET_CATALOG',enabled:true})
      .then(result=>{
        if (!result?.ok || result.catalog?.contract!=='spicychat-archive-block-presets-v1' || !Array.isArray(result.catalog.presets))
          throw Error(result?.error || 'Catalog unavailable');
        catalog=result.catalog;
        status.textContent=`Catalog v${catalog.catalogVersion}: ${catalog.presets.length} presets, ${catalog.characters.length} characters and ${catalog.groups.length} groups${result.offline?' (offline cache)':''}.`;
        render();
      }).catch(error=>{status.textContent=`Could not load catalog: ${String(error?.message||error)}. Your other filters continue to work.`;})
      .finally(()=>{pending=null;});
    return pending;
  }
  enabled.addEventListener('change',()=>{
    if (enabled.checked) loadCatalog(); else {groupsHost.replaceChildren();status.textContent='Disabled. Existing saved selections remain available.';}
  });
  loaders.archiveBlockingPresetsEnabled = settings => {enabled.checked=!!settings.archiveBlockingPresetsEnabled; if (enabled.checked) loadCatalog();};
  loaders.archiveBlockingPresetsSelection = settings => {
    selection = normalize(settings.archiveBlockingPresetsSelection);
    stateInput.value=JSON.stringify(selection);
    if (catalog && enabled.checked) render();
  };
})();
