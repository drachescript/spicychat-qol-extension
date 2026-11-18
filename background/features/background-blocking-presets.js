'use strict';
// Optional, public title-only Archive Blocking Presets. No public bot data,
// account details or user preference list is ever uploaded to the Archive.
(() => {
  const TYPE = 'DS_ARCHIVE_BLOCK_PRESET_CATALOG';
  const KEY = 'dsArchiveBlockingCatalogV1';
  const MANIFEST = 'https://spicychatarchive.drache.uk/data/block-presets/manifest.json';
  const CANONICAL_CATALOG = 'https://spicychatarchive.drache.uk/data/block-presets/catalog.json';
  const TTL = 6 * 60 * 60 * 1000;
  let pending = null;
  let current = null;
  const allowed = sender => {
    const raw = String(sender?.url || sender?.tab?.url || '');
    try {
      const u = new URL(raw);
      return (u.protocol === 'https:' && /^(?:www\.)?spicychat\.ai$/i.test(u.hostname)) ||
        (u.protocol === chrome.runtime.getURL('').split(':')[0] + ':' && u.origin === new URL(chrome.runtime.getURL('/')).origin);
    } catch { return false; }
  };
  const read = keys => new Promise(resolve => chrome.storage.local.get(keys, data => resolve(chrome.runtime.lastError ? {} : (data || {}))));
  const save = data => new Promise(resolve => chrome.storage.local.set(data, () => resolve(!chrome.runtime.lastError)));
  async function getJson(url, maxLength) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {credentials:'omit',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
      if (!response.ok) throw Error(`Archive HTTP ${response.status}`);
      const text = await response.text();
      if (text.length > maxLength) throw Error('Archive response too large');
      return JSON.parse(text);
    } finally {clearTimeout(timeout);}
  }
  function validCatalog(value, version) {
    return value?.schemaVersion === 1 && value.contract === 'spicychat-archive-block-presets-v1' &&
      value.catalogVersion === version && Array.isArray(value.presets) && Array.isArray(value.characters) &&
      Array.isArray(value.groups) && value.presets.length <= 500 && value.characters.length <= 5000 &&
      value.groups.length <= 1000;
  }
  async function catalog() {
    const now = Date.now();
    if (current?.catalog && current.checkedAt > now - TTL) return current.catalog;
    const saved = current || (await read([KEY]))[KEY];
    if (saved?.catalog && validCatalog(saved.catalog, saved.version) && saved.checkedAt > now - TTL) {
      current = saved;
      return saved.catalog;
    }
    // The manifest is small and checked only for an explicitly enabled preset
    // feature (and at most once per six hours). The catalog is reused until its
    // numeric version changes. Offline browsing can reuse the last valid copy.
    try {
      const manifest = await getJson(MANIFEST, 16000);
      if (manifest?.schemaVersion !== 1 || manifest.contract !== 'spicychat-archive-block-presets-v1' ||
          !Number.isSafeInteger(manifest.catalogVersion) || manifest.catalogVersion < 1)
        throw Error('Unsupported Archive manifest');
      if (saved?.catalog && saved.version === manifest.catalogVersion && validCatalog(saved.catalog, saved.version)) {
        current = {...saved, checkedAt:now};
        await save({[KEY]:current});
        return current.catalog;
      }
      if (manifest.catalog !== CANONICAL_CATALOG) throw Error('Untrusted catalog location');
      const fresh = await getJson(CANONICAL_CATALOG, 500000);
      if (!validCatalog(fresh, manifest.catalogVersion)) throw Error('Invalid Archive catalog contract');
      current = {version:manifest.catalogVersion,checkedAt:now,catalog:fresh};
      await save({[KEY]:current});
      return fresh;
    } catch(error) {
      if (saved?.catalog && validCatalog(saved.catalog, saved.version)) {
        current = {...saved,checkedAt: now - TTL + 60000}; // retry on next visit after a minute
        return current.catalog;
      }
      throw error;
    }
  }
  dsqRegisterBackgroundMessageHandler(TYPE, 'archive-blocking-presets', (message,sender,respond) => {
    if (!allowed(sender) || message?.enabled !== true) {
      respond({ok:false,error:'Archive presets must be explicitly enabled.'}); return false;
    }
    if (!pending) pending = catalog().finally(()=>{pending=null;});
    pending.then(value=>respond({ok:true,catalog:value,offline:current?.checkedAt <= Date.now()-TTL}))
      .catch(error=>respond({ok:false,error:String(error?.message||error).slice(0,160)}));
    return true;
  });
})();
