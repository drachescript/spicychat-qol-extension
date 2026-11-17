// Archive Community Themes: optional public bot-ID evidence, never a native block.
// Loaded only on listing routes when explicitly enabled. No observers or polling.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const MAX_LOCAL = 1200;
  const positiveTtl = 25 * 60 * 1000;
  const unknownTtl = 4 * 60 * 1000;
  const cache = new Map();
  const inFlight = new Set();
  const pending = new Map(); // UUID -> weak DOM reference; never retain old listing cards.
  let batchRoute = "";
  let catalog = null;
  let catalogPromise = null;
  let catalogLoadedAt = 0;
  let catalogRetryAfter = 0;
  let version = '';
  let requestBusy = false;
  let retryAfter = 0;
  let selectionSignature = '';
  let selection = new Set();
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
  const aliasDefault = Object.freeze({
    infidelity: 'cheating', adultery: 'cheating', unfaithful: 'cheating',
    'emotional-cheating': 'emotional-affair', 'emotional-infidelity': 'emotional-affair',
    netorare: 'ntr', netorase: 'ntr', cuckolding: 'cuckold', cuckquean: 'cuckold',
    cuckqueaning: 'cuckold'
  });
  const split = value => Array.isArray(value) ? value : String(value || '').split(/[\n,]+/);
  function tagId(value) {
    const key = normalize(value);
    return catalog?.aliases?.[key] || catalog?.labels?.[key] || aliasDefault[key] || key;
  }
  function activeSelection(settings = DS.state?.settings || {}) {
    const raw = `${settings.archiveCommunityThemesExtraTags || ''}|${settings.blockCards ? split(settings.blockedTags).join(';') : ''}|${location.search}`;
    if (raw === selectionSignature) return selection;
    selectionSignature = raw;
    selection = new Set(split(settings.archiveCommunityThemesExtraTags).map(tagId).filter(Boolean));
    if (settings.blockCards) for (const tag of split(settings.blockedTags)) {
      const id = tagId(tag); if (id) selection.add(id);
    }
    // Only genuine native negative refinement chips. A positive tag or an
    // unrelated query string must never be interpreted as a blocked theme.
    for (const [key, value] of new URLSearchParams(location.search)) {
      if (!/\[refinementList\]\[tags\](?:\[\d+\])?$/i.test(key) || !value.startsWith('-')) continue;
      const id = tagId(value.slice(1)); if (id) selection.add(id);
    }
    return selection;
  }
  function excluded(id, settings) {
    if (!UUID.test(String(id || ''))) return true;
    if (split(settings.archiveCommunityThemesAllowIds).some(x => String(x).trim().toLowerCase() === id)) return true;
    if (settings.protectFavoritesFromBlocking && DS.state?.favoriteBotIdSet?.has(id)) return true;
    if (DS.state?.blockedBotIdSet?.has(id)) return true; // Already hidden by explicit block.
    return false;
  }
  function pick(id, settings) {
    if (!settings.enabled || !settings.archiveCommunityThemesEnabled || excluded(id, settings)) return null;
    const record = cache.get(id);
    if (!record || record.until < Date.now() || record.version !== version) return null;
    const chosen = activeSelection(settings);
    if (!chosen.size) return null;
    const kinds = {reviewed: 3, 'rule-candidate': 2, 'historical-tag': 1};
    const hits = (record.signals || []).filter(x => chosen.has(tagId(x.tagId)) && kinds[x.kind]);
    const priority = x => x.kind === 'reviewed' && x.confidence === 'verified' ? 3 :
      x.kind === 'rule-candidate' && x.confidence === 'candidate' ? 2 :
      x.kind === 'historical-tag' && x.confidence === 'historical-only' ? 1 : 0;
    hits.sort((a,b) => priority(b)-priority(a));
    for (const hit of hits) {
      const level = priority(hit);
      if (!level) continue;
      const display = catalog?.display?.[tagId(hit.tagId)] || String(hit.tagId || '').replace(/-/g, ' ');
      const origin = level === 3 ? 'human-reviewed, verified' : level === 2 ? 'title rule, candidate — not verified' : 'historically observed tag — not current proof';
      const detail = String(hit.reason || hit.ruleId || '').slice(0, 160);
      const evidence = `Archive: ${display} (${origin})${detail ? ` — ${detail}` : ''}`;
      if (level === 3 || (level === 2 && settings.archiveCommunityThemesMode === 'candidates')) {
        return {hide:true, evidence, kind:hit.kind, tagId:hit.tagId};
      }
      if (settings.archiveCommunityThemesRiskWarnings === true) {
        return {hide:false, evidence, kind:hit.kind, tagId:hit.tagId};
      }
    }
    return null;
  }
  DS.getArchiveCommunityThemeMatch = (id, settings) => pick(String(id || '').toLowerCase(), settings || DS.state?.settings || {});
  // Warning-only status has no hidden-card side effects. CSS pseudo-element is
  // loaded with this optional JS module, without retaining detached card nodes.
  function markWarning(card, match) {
    if (!card) return;
    const warning = match && !match.hide ? match.evidence : '';
    if (warning) {
      if (card.dataset.dsArchiveWarning !== warning) card.dataset.dsArchiveWarning = warning;
      if (!card.classList.contains('ds-archive-risk-warning')) card.classList.add('ds-archive-risk-warning');
      if (card.getAttribute('title') !== warning) card.setAttribute('title', warning);
    } else if (card.classList.contains('ds-archive-risk-warning')) {
      card.classList.remove('ds-archive-risk-warning');
      delete card.dataset.dsArchiveWarning;
      if (String(card.title || '').startsWith('Archive: ')) card.removeAttribute('title');
    }
  }
  DS.applyArchiveCommunityThemeWarning = function (card,id,settings) {
    if (!settings.archiveCommunityThemesEnabled) { markWarning(card, null); return; }
    markWarning(card, pick(String(id || '').toLowerCase(), settings));
  };
  if (!document.getElementById('ds-archive-community-warning-css')) {
    const style = document.createElement('style');
    style.id = 'ds-archive-community-warning-css';
    style.textContent = `.ds-archive-risk-warning{position:relative!important}`+
      `.ds-archive-risk-warning::after{content:"Archive: unverified theme";position:absolute;right:5px;top:5px;`+
      `font:11px/1.2 sans-serif;padding:3px 5px;background:#5f4822;color:#fff3d1;`+
      `border-radius:4px;z-index:4;pointer-events:none}`;
    document.documentElement.append(style);
  }
  function updateData(id, entry, snapshotVersion) {
    const signals = Array.isArray(entry?.signals) ? entry.signals.filter(x => x &&
      typeof x.tagId === 'string' && ['reviewed','rule-candidate','historical-tag'].includes(x.kind) &&
      ['verified','candidate','historical-only'].includes(x.confidence)).slice(0, 45) : [];
    cache.delete(id);
    cache.set(id,{signals,version:snapshotVersion,until:Date.now()+(signals.length?positiveTtl:unknownTtl)});
    if(cache.size>MAX_LOCAL)cache.delete(cache.keys().next().value);
  }
  function notifyCards(changed = [], full = false) {
    const state = DS.state;
    if (!state || !state.settings?.archiveCommunityThemesEnabled) return;
    if (full) {
      // Only a changed snapshot/taxonomy needs a full reconciliation.
      state.archiveThemeRevision = (state.archiveThemeRevision || 0) + 1;
      state.listingDirtyNeedsFullPass = true;
    } else {
      const dirty = state.listingDirtyCards instanceof Set
        ? state.listingDirtyCards : (state.listingDirtyCards = new Set());
      for (const card of changed) if (card?.isConnected) dirty.add(card);
      if (!dirty.size) return;
    }
    DS.scheduleRun?.({priority:'normal',source:'archive-community-evidence'});
  }
  async function send(message) {
    if (!chrome?.runtime?.sendMessage) throw Error('Background messaging unavailable');
    return chrome.runtime.sendMessage(message);
  }
  async function loadCatalog() {
    if (catalogPromise) return catalogPromise;
    if (Date.now() < catalogRetryAfter) return Promise.resolve();
    catalogPromise = send({type:'DS_ARCHIVE_COMMUNITY_CATALOG'}).then(result => {
      if (!result?.ok || !Array.isArray(result.tags)) return;
      const labels = {}, display = {}, aliases = {};
      for (const t of result.tags.slice(0,1200)) {
        const id = normalize(t.id); if(!id)continue;
        labels[normalize(t.label)] = id;
        display[id] = String(t.label || id).slice(0,100);
      }
      for (const [id,values] of Object.entries(result.aliases||{})) {
        const canonical = normalize(id);
        if(!canonical || !Array.isArray(values))continue;
        for(const value of values.slice(0,30))aliases[normalize(value)] = canonical;
      }
      catalog = {labels,display,aliases};
      catalogLoadedAt = Date.now();
      selectionSignature = ''; // Resolve names and aliases afresh.
      notifyCards([], true);
    }).catch(() => { catalogRetryAfter = Date.now()+5*60*1000; }).finally(() => {catalogPromise = null;});
    return catalogPromise;
  }
  // Called only from the existing changed-card filter pass. Never fetches
  // profiles, scans personal chats, starts an observer or schedules polling.
  async function pumpQueue() {
    if (requestBusy || Date.now() < retryAfter || !pending.size) return;
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.archiveCommunityThemesEnabled ||
        location.href !== batchRoute) { pending.clear(); return; }
    const entries = [...pending.entries()].slice(0,80);
    for (const [id] of entries) pending.delete(id);
    const ids = entries.map(([id]) => id);
    ids.forEach(id => inFlight.add(id));
    requestBusy = true;
    try {
      const result = await send({type:'DS_ARCHIVE_COMMUNITY_LOOKUP',ids});
      if (!DS.state?.settings?.archiveCommunityThemesEnabled || location.href !== batchRoute) return;
      if (!result?.ok || typeof result.version !== 'string' || !result.version) {
        retryAfter = Date.now()+3*60*1000;
        return;
      }
      const changedVersion = !!version && version !== result.version;
      if (changedVersion) cache.clear();
      version = result.version;
      const matches = result.matches && typeof result.matches==='object' ? result.matches : {};
      const dirty = [];
      for (const [id,ref] of entries) {
        if (!Object.prototype.hasOwnProperty.call(matches,id)) continue;
        updateData(id,matches[id],version);
        const card = ref?.deref?.();
        if (card?.isConnected) dirty.push(card);
      }
      // A version change invalidates earlier decisions globally. Otherwise
      // only process the <=80 cards whose evidence actually arrived.
      notifyCards(dirty,changedVersion);
    } catch {
      retryAfter = Date.now()+3*60*1000;
    } finally {
      ids.forEach(id => inFlight.delete(id)); requestBusy = false;
      // Sequential opt-in batched requests: never poll; never reread the DOM.
      // The active card pass already provided the IDs and weak references.
      if (pending.size && Date.now() >= retryAfter && location.href === batchRoute) void pumpQueue();
    }
  }
  DS.queueArchiveCommunityThemeLookups = function (cards = []) {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.archiveCommunityThemesEnabled || Date.now() < retryAfter) return;
    if ((!catalog || Date.now()-catalogLoadedAt>6*60*60*1000) && !catalogPromise && Date.now() >= catalogRetryAfter) void loadCatalog();
    if (!activeSelection(settings).size) return;
    if (batchRoute !== location.href) { pending.clear(); batchRoute = location.href; }
    const supportsWeakRefs = typeof WeakRef === 'function';
    const now = Date.now();
    for (const item of cards) {
      const id = String(DS.botIdFromHref?.(item?.anchor?.href || '') || '').toLowerCase();
      if (!UUID.test(id) || inFlight.has(id) || pending.has(id) || excluded(id,settings)) continue;
      const old = cache.get(id);
      if (old && old.until >= now && old.version === version) continue;
      if (pending.size >= 5000) break;
      pending.set(id,supportsWeakRefs && item.card ? new WeakRef(item.card) : null);
    }
    if (pending.size) void pumpQueue();
  };
  DS.archiveCommunityThemeDiagnostics = () => ({known:cache.size,queued:pending.size,version,requestBusy,retryAfter});
})();
