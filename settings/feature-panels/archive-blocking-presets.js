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
  host.append(element('p',{className:'hint'},'Choose existing Archive franchise, character, group and theme presets below, even while filtering is OFF. Selecting a preset saves your choice but never blocks a bot or activates a filter by itself. Only public bot names and titles are matched; descriptions, greetings, tags and supporting character mentions are ignored. Hides are reversible — never native Blocks, dislikes, Less Like This or saved ratings.'));
  const browseRow = element('div',{className:'button-row'});
  const browseButton = element('button',{type:'button',id:'archiveBlockingPresetsBrowse'},'Browse existing Archive presets');
  const officialLink = element('a',{href:'https://spicychatarchive.drache.uk/presets/',target:'_blank',rel:'noopener noreferrer'},'View catalog on Archive');
  browseRow.append(browseButton,officialLink);
  host.append(browseRow);
  const status = element('p',{className:'hint',id:'archiveBlockingPresetsStatus','aria-live':'polite'},'Choose Browse to load existing presets. Filtering stays off until enabled above.');
  const groupsHost = element('div',{id:'archiveBlockingPresetsControls'});
  const pickerTools = element('div',{className:'sub-card'});
  const pickerSearch = element('input',{type:'search',placeholder:'Find a franchise, character, group, or theme…'});
  pickerSearch.setAttribute('aria-label','Search Archive blocking presets');
  const selectionSummary = element('p',{className:'hint','aria-live':'polite'});
  const searchHelp = element('p',{className:'hint'},'Choose only the franchises, characters, groups or themes you want. Leave everything else visible.');
  pickerTools.append(pickerSearch,selectionSummary,searchHelp);
  pickerTools.hidden = true;
  let searchDelay = 0;
  pickerSearch.addEventListener('input',()=>{
    clearTimeout(searchDelay);
    searchDelay = setTimeout(render,120);
  });
  const stateInput = element('input',{id:'archiveBlockingPresetsSelection',type:'hidden'});
  host.append(status,stateInput,pickerTools,groupsHost);
  const requestArchiveCatalog = () => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error); else resolve(value);
    };
    try {
      const result = chrome.runtime.sendMessage({type:'DS_ARCHIVE_BLOCK_PRESET_CATALOG',enabled:true}, value => {
        const error = chrome.runtime.lastError;
        finish(value, error ? new Error(error.message || String(error)) : null);
      });
      if (result && typeof result.then === 'function') result.then(value => finish(value), error => finish(null,error));
    } catch (error) { finish(null,error); }
  });
  const empty = () => ({franchises:{},characters:[],groups:[],themes:[]});
  let selection = empty(), catalog = null, pending = null, previewRequested = false;
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
    updateCounts();
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
  function updateCounts() {
    const franchises = Object.values(selection.franchises).filter(cfg=>cfg?.enabled).length;
    selectionSummary.textContent = `${franchises} franchises, ${selection.characters.length} individual characters, ${selection.groups.length} groups, ${selection.themes.length} themes selected.`;
  }
  function render() {
    groupsHost.replaceChildren();
    pickerTools.hidden = !catalog || (!enabled.checked && !previewRequested);
    updateCounts();
    if (!catalog || (!enabled.checked && !previewRequested)) return;
    const query = pickerSearch.value.trim().toLocaleLowerCase();
    const matches = item => !query || [item.name,item.category,item.franchiseId]
      .some(value => String(value || '').toLocaleLowerCase().includes(query));
    const addSection = (heading, items, factory, collapsed=false) => {
      if (query && !items.length) return;
      const section = element(collapsed ? 'details' : 'div',{className:'sub-card'});
      section.append(element(collapsed ? 'summary' : 'h4',{},`${heading} (${items.length})`));
      // The full character catalog is useful for choosing exceptions, but
      // rendering 187+ checkboxes before a user opens the section is wasteful.
      // Only mount the entries when expanded or when filtering by search.
      let mounted = false;
      const mount = () => {
        if (mounted) return;
        mounted = true;
        for (const item of items) section.append(factory(item));
      };
      if (collapsed) {
        if (query) { section.open = true; mount(); }
        else section.addEventListener('toggle',()=>{ if (section.open) mount(); });
      } else mount();
      groupsHost.append(section);
    };
    addSection('Franchises / games / anime / movies',catalog.presets.filter(p=>p.kind==='franchise' && matches(p)),preset=>{
      const box=element('div',{className:'sub-card'});
      const id=preset.id;
      const cfg=selection.franchises[id] || {enabled:false,mode:'all',keepGenders:[],keepCharacterIds:[]};
      const detail=element('div');detail.hidden=!cfg.enabled;
      const apply=patch=>{
        selection.franchises[id]={...cfg,...selection.franchises[id],...patch};
        changed();
      };
      const header=labelCheckbox(`${preset.name} (${preset.category || 'franchise'})`,cfg.enabled,active=>{
        apply({enabled:active});detail.hidden=!active;
        if (active) renderCustom();
      });
      box.append(header);
      const modeLabel=element('label');modeLabel.append(element('span',{},'Hide mode '));
      const mode=element('select');
      mode.setAttribute('aria-label',`Hide mode for ${preset.name}`);
      for (const [value,text] of [['all','Hide all matching'],['keep-female','Hide male characters (keep female)'],['keep-male','Hide female characters (keep male)'],['custom','Custom keep exceptions']])
        mode.append(element('option',{value},text));
      mode.value=cfg.mode;
      const custom=element('div');
      mode.addEventListener('change',()=>{apply({mode:mode.value});renderCustom();});
      modeLabel.append(mode);detail.append(modeLabel,custom);
      const renderCustom=()=>{
        custom.replaceChildren();
        const current=selection.franchises[id] || cfg;
        if (mode.value==='custom') {
          custom.append(element('p',{className:'hint'},'Only recognized single-character titles outside your keep exceptions are hidden. Unknown, group-only, mixed and gender-swapped titles stay visible.'));
          for (const gender of ['female','male','nonbinary'])
            custom.append(labelCheckbox(`Keep ${gender} characters`,arr(current.keepGenders).includes(gender),on=>{
              const set=new Set(arr((selection.franchises[id]||cfg).keepGenders));
              if(on)set.add(gender);else set.delete(gender);
              apply({keepGenders:[...set]});
            }));
        } else custom.append(element('p',{className:'hint'},mode.value==='all'?
          'Hide strong franchise and recognized character/group matches, including unknown main characters.':
          'Hide only a single confidently identified canonical character of the unwanted gender.'));
        const chars=(catalog.characters||[]).filter(x=>x.franchiseId===preset.franchiseId);
        if (!chars.length) return;
        const exceptions=element('details');
        exceptions.append(element('summary',{},`Keep individual characters (${chars.length} available)`));
        // Exceptions are only rendered after this individual franchise opens.
        exceptions.addEventListener('toggle',()=>{
          if (!exceptions.open || exceptions.dataset.loaded) return;
          exceptions.dataset.loaded='1';
          for (const character of chars)
            exceptions.append(labelCheckbox(`${character.name} (${character.gender})`,arr((selection.franchises[id]||cfg).keepCharacterIds).includes(character.id),on=>{
              const set=new Set(arr((selection.franchises[id]||cfg).keepCharacterIds));
              if(on)set.add(character.id);else set.delete(character.id);
              apply({keepCharacterIds:[...set]});
            }));
        });
        custom.append(exceptions);
      };
      if(cfg.enabled)renderCustom();
      box.append(detail);return box;
    });
    addSection('Individual characters', (catalog.characters||[]).filter(matches),item=>
      labelCheckbox(`${item.name} (${item.gender})`,selection.characters.includes(item.id),on=>choose(item.id,'characters',on)),true);
    addSection('Groups',(catalog.groups||[]).filter(matches),item=>
      labelCheckbox(item.name,selection.groups.includes(item.id),on=>choose(item.id,'groups',on)),true);
    addSection('Title themes',catalog.presets.filter(p=>p.kind==='theme' && matches(p)),item=>
      labelCheckbox(item.name,selection.themes.includes(item.id),on=>choose(item.id,'themes',on)));
    if (query && !groupsHost.children.length) groupsHost.append(element('p',{className:'hint'},'No matching presets. Try another name.'));
    groupsHost.append(element('p',{className:'hint'},'Archive discovery suggestions are review-only. Presets hide matching cards locally; they do not change native blocks, dislikes or ratings. Changes use the normal QoL Settings autosave.'));
  }
  async function loadCatalog() {
    if ((!enabled.checked && !previewRequested) || pending) return pending;
    if (catalog) { render(); return; }
    status.textContent='Loading public Archive preset catalog…';
    pending=requestArchiveCatalog()
      .then(result=>{
        if (!result?.ok || result.catalog?.contract!=='spicychat-archive-block-presets-v1' || !Array.isArray(result.catalog.presets))
          throw Error(result?.error || 'Catalog unavailable');
        catalog=result.catalog;
        status.textContent=`Archive catalog v${catalog.catalogVersion}: ${catalog.presets.filter(item=>item.kind==='franchise').length} franchises, ${catalog.presets.filter(item=>item.kind==='theme').length} themes, ${catalog.characters.length} characters and ${catalog.groups.length} groups${result.offline?' (offline cache)':''}. ${enabled.checked?'Selected presets can hide matching cards.':'Preview mode: no cards are being hidden.'}`;
        render();
      }).catch(error=>{status.textContent=`Could not load Archive catalog: ${String(error?.message||error)}. Check your connection or retry Browse. Existing settings remain saved.`;})
      .finally(()=>{pending=null;});
    return pending;
  }
  browseButton.addEventListener('click',()=>{
    previewRequested = true;
    if (catalog) { render(); return; }
    loadCatalog();
  });
  enabled.addEventListener('change',()=>{
    if (enabled.checked) loadCatalog();
    else {
      render();
      status.textContent = catalog ? 'Filtering is OFF. Your selected Archive presets are saved; browse and edit them below.'
        : 'Filtering is OFF. Browse existing Archive presets without enabling filtering.';
    }
  });
  loaders.archiveBlockingPresetsEnabled = settings => {enabled.checked=!!settings.archiveBlockingPresetsEnabled; if (enabled.checked) loadCatalog();};
  loaders.archiveBlockingPresetsSelection = settings => {
    selection = normalize(settings.archiveBlockingPresetsSelection);
    stateInput.value=JSON.stringify(selection);
    updateCounts();
    if (catalog && enabled.checked) render();
  };
})();
