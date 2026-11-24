// Archive Blocking Presets: opt-in, title/name-only and hide-only.
// No new observer or timer; the existing card reconciliation drives matching.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;
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
  const CONTRACT = 'spicychat-archive-block-presets-v1';
  let catalog = null, pending = null, retryAfter = 0;
  let selection = null, catalogIndex = null;
  function indexCatalog(value) {
    const characters = new Map(), groups = new Map();
    for (const character of value.characters || []) {
      if (!characters.has(character.franchiseId)) characters.set(character.franchiseId, []);
      characters.get(character.franchiseId).push(character);
    }
    for (const group of value.groups || []) {
      if (!groups.has(group.franchiseId)) groups.set(group.franchiseId, []);
      groups.get(group.franchiseId).push(group);
    }
    return { value, characters, groups,
      charactersById: new Map((value.characters || []).map(item => [item.id, item])),
      groupsById: new Map((value.groups || []).map(item => [item.id, item])),
      themesById: new Map((value.presets || []).filter(p=>p.kind === 'theme').map(item => [item.id, item])),
      franchises: (value.presets || []).filter(p => p.kind === 'franchise') };
  }
  const clean = input => String(input ?? '').replace(/([a-z])([A-Z])/g,'$1 $2')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  const includesPhrase = (haystack, phrase) => {
    const term = clean(phrase);
    return !!term && (` ${haystack} `).includes(` ${term} `);
  };
  function matchedAliases(text, aliases = [], context = false) {
    return aliases.filter(alias => {
      const term = typeof alias === 'string' ? alias : alias?.text;
      const strength = typeof alias === 'string' ? 'strong' : alias?.strength;
      return (strength === 'strong' || (strength === 'contextual' && context)) && includesPhrase(text, term);
    });
  }
  const isVariant = text => /\b(?:gender ?bent|gender ?bend|gender ?swap|gender ?flipped|fem(?:ale)? version|male version|female oc|male oc|fem ?ghost|female ghost|male katara|female price|fem ?soap)\b/.test(text);
  const array = value => Array.isArray(value) ? value.filter(x => typeof x === 'string').slice(0, 500) : [];
  function settingsNow(s) {
    const raw = s?.archiveBlockingPresetsSelection;
    if (selection && raw === selection.source) return selection.value;
    const franchises = raw?.franchises && typeof raw.franchises === 'object' ? raw.franchises : {};
    return (selection = {source:raw,value:{franchises,characters:new Set(array(raw?.characters)),
      groups:new Set(array(raw?.groups)),themes:new Set(array(raw?.themes))}}).value;
  }
  function evaluateFranchise(preset, text, cfg, chars, groups) {
    const matches = matchedAliases(text,preset.aliases);
    const strongFranchise = matches.some(x => (typeof x === 'string' ? 'strong' : x?.strength) === 'strong');
    const matchedGroups = groups.filter(group => matchedAliases(text,group.aliases).length);
    const matchedChars = chars.filter(character => matchedAliases(text,character.aliases,strongFranchise).length);
    if (!strongFranchise && !matchedGroups.length && !matchedChars.length) return null;
    const mode = ['all','keep-female','keep-male','custom'].includes(cfg?.mode) ? cfg.mode : 'all';
    const keepIds = new Set(array(cfg?.keepCharacterIds));
    const keepGenders = new Set(mode === 'keep-female' ? ['female'] : mode === 'keep-male' ? ['male'] :
      mode === 'custom' ? array(cfg?.keepGenders) : []);
    const keepMatch = matchedChars.some(character => keepIds.has(character.id) || keepGenders.has(character.gender));
    if (keepMatch) return {hide:false, reason:'explicit keep exception'};
    if (mode === 'all') return {hide:true,reason:`${preset.name}: franchise, character or group title`};
    if (isVariant(text)) return {hide:false,reason:'gender variant'};
    // Conservatively leave unknown, mixed-character, group-only and multiple
    // known-character titles visible, regardless of their canonical genders.
    if (matchedChars.length !== 1 || !['female','male','nonbinary'].includes(matchedChars[0].gender))
      return {hide:false,reason:'unknown or mixed character'};
    if (keepIds.has(matchedChars[0].id) || keepGenders.has(matchedChars[0].gender)) return {hide:false,reason:'kept character'};
    return {hide:true,reason:`${preset.name}: identified ${matchedChars[0].name || matchedChars[0].id} (${matchedChars[0].gender})`};
  }
  function matchTitle(rawText, state, cat) {
    const text = clean(rawText);
    if (!text) return null;
    const selected = settingsNow(state);
    const index = catalogIndex?.value === cat ? catalogIndex : indexCatalog(cat);
    const franchises = index.franchises;
    for (const preset of franchises) {
      const cfg = selected.franchises[preset.id] || selected.franchises[preset.franchiseId];
      if (!cfg || cfg.enabled !== true) continue;
      const chars = index.characters.get(preset.franchiseId) || [];
      const groups = index.groups.get(preset.franchiseId) || [];
      const hit = evaluateFranchise(preset,text,cfg,chars,groups);
      if (hit?.hide) return {hide:true,reason:hit.reason};
    }
    for (const id of selected.characters) {
      const character = index.charactersById.get(id);
      if (!character) continue;
      const franchise = franchises.find(p => p.franchiseId === character.franchiseId);
      const context = !!franchise && matchedAliases(text,franchise.aliases).some(x => x.strength === 'strong');
      if (!isVariant(text) && matchedAliases(text,character.aliases,context).length)
        return {hide:true,reason:`character: ${character.name || character.id}`};
    }
    for (const id of selected.groups) {
      const group = index.groupsById.get(id);
      if (group && matchedAliases(text,group.aliases).length)
        return {hide:true,reason:`group: ${group.name || group.id}`};
    }
    for (const id of selected.themes) {
      const theme = index.themesById.get(id);
      if (theme && matchedAliases(text,theme.aliases).length)
        return {hide:true,reason:`theme title: ${theme.name}`};
    }
    return null;
  }
  function cardNames(card) {
    // Only the native name link and its own title/alt; no description/greeting,
    // creator byline, whole-card text, or helper-generated tag badges.
    const link = card?.querySelector?.("a[aria-label^='chat-with-'][href*='/chat/'],a[aria-label^='chat-with-'][href*='/chatbot/']");
    // Do not call the shared getCardTitle helper: its legacy fallback scans
    // arbitrary <p>/<span> nodes and can accidentally return a DESCRIPTION.
    // When no verified bot-name link or public-title attribute exists,
    // fail open rather than guessing from generic card text.
    const profileTitleLink = card?.querySelector?.('a[href*="/chatbot/"][title]');
    if (!link && !profileTitleLink) return [];
    const names = [];
    if (link) {
      names.push(link.getAttribute('aria-label')?.replace(/^chat-with-/i,'') || '');
      names.push(link.querySelector('img[alt]')?.getAttribute('alt') || '');
      const explicitName = link.querySelector("h1,h2,h3,[data-testid*='name'],[data-testid*='title']");
      if (explicitName) names.push(explicitName.textContent || '');
    }
    const publicTitle = profileTitleLink?.getAttribute('title') || '';
    if (publicTitle && publicTitle.length <= 180) names.push(publicTitle);
    return [...new Set(names.map(n=>String(n).trim()).filter(n=>n && n.length <= 240))];
  }
  DS.getArchiveBlockingPresetMatch = (card, settings = DS.state?.settings || {}) => {
    if (!settings?.enabled || !settings.archiveBlockingPresetsEnabled || !catalog) return null;
    for (const name of cardNames(card)) {
      const result = matchTitle(name,settings,catalog);
      if (result?.hide) return result;
    }
    return null;
  };
  DS.archiveBlockingPresetsMatcher = Object.freeze({normalize:clean,matchTitle, evaluateFranchise});
  function notify() {
    if (!DS.state?.settings?.archiveBlockingPresetsEnabled) return;
    DS.state.archiveBlockingRevision = (DS.state.archiveBlockingRevision || 0) + 1;
    DS.state.listingDirtyNeedsFullPass = true;
    DS.state.cardHidingHasFullPass = false;
    DS.scheduleRun?.({priority:'normal',source:'archive-blocking-presets-catalog'});
  }
  function load() {
    if (catalog || pending || Date.now() < retryAfter) return;
    if (!DS.state?.settings?.archiveBlockingPresetsEnabled) return;
    pending = requestArchiveCatalog()
      .then(response => {
        const value = response?.catalog;
        if (!response?.ok || value?.schemaVersion !== 1 || value.contract !== CONTRACT || !Array.isArray(value.presets))
          throw Error(response?.error || 'No valid Archive catalog available');
        catalog = value;
        catalogIndex = indexCatalog(value);
        notify();
      }).catch(() => {retryAfter=Date.now()+60000;})
      .finally(()=>{pending=null;});
  }
  DS.ensureArchiveBlockingPresets = load;
  load();
})();
