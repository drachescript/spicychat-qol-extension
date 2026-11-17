"use strict";
// Public Archive Community Themes only. No personal data leaves the browser:
// requests send bot UUIDs; never titles, chats, definitions, filters or accounts.
(() => {
  const TYPE = 'DS_ARCHIVE_COMMUNITY_LOOKUP';
  const CAT = 'DS_ARCHIVE_COMMUNITY_CATALOG';
  const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const MANIFEST = 'https://data.spicychatarchive.drache.uk/indexes/community-tags/manifest.json';
  const TAXONOMY = 'https://spicychatarchive.drache.uk/data/community-tags/taxonomy.json';
  const ALIASES = 'https://spicychatarchive.drache.uk/data/community-tags/aliases.json';
  const LOOKUP = 'https://spicychat-archive-import.dragongraf.workers.dev/api/community-tags/lookup';
  const TTL = 6 * 60 * 60 * 1000;
  const LIMIT = 1800;
  let currentVersion = '';
  let lastManifestAt = 0;
  let manifestPromise = null;
  let catalog = null;
  let catalogAt = 0;
  let catalogPromise = null;
  let lookupChain = Promise.resolve();
  const records = new Map();
  const permitted = sender => {
    const url = String(sender?.url || sender?.tab?.url || '');
    try {const u=new URL(url);return u.protocol === 'https:' && /^(?:www\.)?spicychat\.ai$/i.test(u.hostname);} catch{return false;}
  };
  async function json(url,opts={}) {
    const controller = new AbortController();
    const handle = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(url, {method:opts.body?'POST':'GET',
        cache:'no-store',credentials:'omit',signal:controller.signal,
        headers: {Accept:'application/json',...(opts.body?{'Content-Type':'application/json'}:{})},
        ...(opts.body?{body:JSON.stringify(opts.body)}:{})});
      if (!response.ok) throw Error(`Archive HTTP ${response.status}`);
      const text = await response.text();
      if (text.length > (opts.body ? 850000 : 150000)) throw Error('Archive payload exceeded limit');
      return JSON.parse(text);
    } finally {clearTimeout(handle);}
  }
  async function snapshot() {
    if (currentVersion && Date.now()-lastManifestAt<TTL) return currentVersion;
    if (!manifestPromise) manifestPromise = (async()=>{
      const raw = await json(MANIFEST);
      if (!raw || typeof raw!=='object') throw Error('Archive manifest invalid');
      const bytes = new TextEncoder().encode(JSON.stringify(raw));
      const digest = await crypto.subtle.digest('SHA-256',bytes);
      const fingerprint = [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);
      if(currentVersion!==fingerprint) records.clear();
      currentVersion = fingerprint;
      lastManifestAt = Date.now();
      return fingerprint;
    })().finally(()=>{manifestPromise=null;});
    return manifestPromise;
  }
  function scrubSignals(entry) {
    return {status:String(entry?.status||'unknown').slice(0,60),
      signals:(Array.isArray(entry?.signals)?entry.signals:[]).filter(s=>{
        const accepted={reviewed:'verified','rule-candidate':'candidate','historical-tag':'historical-only'};
        return s && typeof s.tagId==='string' && accepted[s.kind]===s.confidence && /^[a-z0-9][a-z0-9-]{0,99}$/.test(s.tagId);
      }).slice(0,45).map(s=>({tagId:s.tagId,kind:s.kind,confidence:s.confidence,
        reason:typeof s.reason==='string'?s.reason.slice(0,160):'',
        ruleId:typeof s.ruleId==='string'?s.ruleId.slice(0,100):'',
        reviewedAt:typeof s.reviewedAt==='string'?s.reviewedAt.slice(0,50):''}))};
  }
  async function lookup(ids) {
    const version=await snapshot();
    const now=Date.now(),matches={},missing=[];
    for(const id of ids) {
      const old=records.get(id);
      if(old?.version===version && old.until>now)matches[id]=old.entry;
      else missing.push(id);
    }
    if(missing.length) {
      const res=await json(LOOKUP,{body:{ids:missing}});
      if(res?.ok!==true || res?.schemaVersion!==1 || !res.matches || typeof res.matches!=='object')
        throw Error('Archive lookup response invalid');
      const complete=res.complete!==false;
      for(const id of missing) {
        const entry=Object.prototype.hasOwnProperty.call(res.matches,id)
          ? scrubSignals(res.matches[id]) : {status:'unknown',signals:[]};
        // Incomplete responses are NEVER taken as proof of absence.
        if(!complete && !res.matches[id])continue;
        matches[id]=entry;
        records.delete(id);
        records.set(id,{entry,version,until:now+(entry.signals.length?25:4)*60*1000});
        if(records.size>LIMIT)records.delete(records.keys().next().value);
      }
    }
    return {ok:true,schemaVersion:1,version,matches,complete:missing.every(id=>!!matches[id])};
  }
  async function getCatalog() {
    if(catalog && Date.now()-catalogAt<TTL)return catalog;
    if(!catalogPromise)catalogPromise=(async()=>{
      const [tax,alias]=await Promise.all([json(TAXONOMY),json(ALIASES)]);
      if(tax?.schemaVersion!==1 || !Array.isArray(tax.tags) || alias?.schemaVersion!==1)
        throw Error('Invalid taxonomy version');
      const tags=tax.tags.slice(0,1200).filter(x=>x && typeof x.id==='string' && typeof x.label==='string')
        .map(x=>({id:x.id.slice(0,100),label:x.label.slice(0,120)}));
      const aliases={};
      for(const [key,values] of Object.entries(alias.byTagId||{}))
        if(Array.isArray(values)) aliases[key.slice(0,100)]=values.slice(0,30).filter(x=>typeof x==='string').map(x=>x.slice(0,100));
      catalog={ok:true,tags,aliases}; catalogAt=Date.now(); return catalog;
    })().finally(()=>{catalogPromise=null;});
    return catalogPromise;
  }
  dsqRegisterBackgroundMessageHandler(TYPE,'archive-community-themes',(msg,sender,respond)=>{
    const ids=Array.isArray(msg?.ids)?[...new Set(msg.ids.map(x=>String(x||'').toLowerCase()))]:[];
    if(!permitted(sender)||ids.length<1||ids.length>80||ids.some(id=>!UUID.test(id))) {
      respond({ok:false,error:'Invalid public Archive lookup batch.'});return false;
    }
    // Serialize enabled batches across tabs, so the next tab can reuse the
    // first tab's cached IDs rather than sending duplicate HTTP requests.
    const pending=lookupChain.catch(()=>{}).then(()=>lookup(ids));
    lookupChain=pending.catch(()=>{});
    pending.then(respond).catch(e=>respond({ok:false,error:String(e?.message||e).slice(0,150)}));
    return true;
  });
  dsqRegisterBackgroundMessageHandler(CAT,'archive-community-themes',(msg,sender,respond)=>{
    if(!permitted(sender)) {respond({ok:false,error:'Unavailable on this page.'});return false;}
    getCatalog().then(respond).catch(e=>respond({ok:false,error:String(e?.message||e).slice(0,150)}));
    return true;
  });
})();
