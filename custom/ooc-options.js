(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const names = ['enabled', 'showOocTools', 'quickPanelShowOoc', 'replaceChatImageWithOocButton', 'hideChatImageButton'];
  const defaults = {enabled:true, showOocTools:true, quickPanelShowOoc:true, replaceChatImageWithOocButton:true, hideChatImageButton:false};
  // Use the canonical built-ins from Full QoL, not a reduced duplicate.
  const builtins = () => window.DragonScriptQoL.DEFAULT_SETTINGS.oocTemplates.map(t => ({...t}));
  let templates = [];
  let savedSettings = {};
  const announce = message => { $('status').textContent = message; };
  const normalize = arr => {
    if (!Array.isArray(arr)) throw Error('Expected a JSON array of OOC templates');
    if (arr.length > 100) throw Error('Too many templates (max 100)');
    return arr.map((t,i) => ({
      id: String(t?.id || `ooc-${i}`).slice(0,140),
      name: String(t?.name || `OOC ${i+1}`).slice(0,140).trim(),
      text: String(t?.text || '').slice(0,20000).trim(),
      builtIn: t?.builtIn === true
    })).filter(t => t.text);
  };
  function render() {
    const host = $('templates'); host.replaceChildren();
    for (const [i,item] of templates.entries()) {
      const card = document.createElement('div'); card.className='preset';
      const label=document.createElement('label'); label.textContent=`Preset ${i+1} name`;
      const name=document.createElement('input');name.type='text';name.value=item.name;name.addEventListener('input',()=>{item.name=name.value});label.append(name);
      const tlabel=document.createElement('label');tlabel.textContent='Text';
      const text=document.createElement('textarea');text.value=item.text;text.addEventListener('input',()=>{item.text=text.value});tlabel.append(text);
      const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.addEventListener('click',()=>{templates.splice(i,1);render()});
      card.append(label,tlabel,remove);host.append(card);
    }
  }
  chrome.storage.local.get(['settings','oocTemplates'], result => {
    if(chrome.runtime.lastError) {announce(chrome.runtime.lastError.message);return}
    savedSettings=result.settings && typeof result.settings === 'object' && !Array.isArray(result.settings) ? result.settings : {};
    for (const name of names) $(name).checked = name in savedSettings ? Boolean(savedSettings[name]) : defaults[name];
    templates = normalize(Array.isArray(result.oocTemplates) ? result.oocTemplates : (Array.isArray(savedSettings.oocTemplates) ? savedSettings.oocTemplates : builtins()));
    render();
  });
  $('add').addEventListener('click',()=>{templates.push({id:`ooc-new-${Date.now()}`,name:'New OOC',text:'[OOC: ]'});render()});
  $('reset').addEventListener('click',()=>{templates=builtins();render();announce('Built-in presets restored in editor; press Save to apply.')});
  $('save').addEventListener('click',()=>{
    const updated = {...savedSettings};for (const name of names) updated[name]=$(name).checked;
    try{const ready=normalize(templates);if(!ready.length)throw Error('Add at least one nonempty OOC preset');updated.oocTemplates=ready;
      chrome.storage.local.set({settings:updated,oocTemplates:ready},()=>{
        if(chrome.runtime.lastError){announce(chrome.runtime.lastError.message);return}
        savedSettings=updated;templates=ready;announce('OOC settings saved.');
      });
    }catch(e){announce(e.message)}
  });
  $('export').addEventListener('click',()=>{
    const json=JSON.stringify(normalize(templates),null,2);const a=document.createElement('a');
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    a.href=url;a.download='spicychat-ooc-presets.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  });
  $('import').addEventListener('change',async event=>{
    const f=event.target.files?.[0];if(!f)return;
    try{if(f.size>1_000_000)throw Error('JSON exceeds 1 MB');const x=JSON.parse(await f.text());templates=normalize(Array.isArray(x)?x:x.oocTemplates);if(!templates.length)throw Error('No nonempty OOC presets');render();announce('Imported to editor. Press Save to keep them.');}
    catch(e){announce(`Import failed: ${e.message}`)}event.target.value='';
  });
})();
