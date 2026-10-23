// Archive recovery parser/planner. Entirely local, no API requests or side effects.
// Handles both the original minimal Archive records and the richer v2 format.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const clean = (s,max) => String(s ?? '').trim().slice(0,max);
  function parse(entry, scope) {
    if (!entry || !UUID.test(entry.id) || typeof entry.content !== 'string' || entry.content.length > 2000 ||
        !String(entry.name || '').startsWith('QoL Archive ')) return null;
    let data;
    try {data = JSON.parse(entry.content);} catch {return null;}
    if (!['dsq-lorebook-archive/v1','dsq-lorebook-archive/v2'].includes(data?.schema) ||
        data.botId !== scope.botId || data.conversationId !== scope.conversationId ||
        typeof data.detailId !== 'string' || !data.detailId || data.detailId.length > 200 ||
        typeof data.content !== 'string' || !data.content.trim() || data.content.length > 2000) return null;
    const keywordList = Array.isArray(data.keywords) ? data.keywords : [];
    return {
      id:entry.id.toLowerCase(), detailId:data.detailId, content:data.content,
      name:clean(data.name || 'Recovered Context Keeper detail',50),
      keywords:keywordList.slice(0,12).map(word=>clean(word,80)).filter(Boolean),
      sourceMessageId:clean(data.sourceMessageId,120),
      version:Number(entry.version) || 1,
      schema:data.schema
    };
  }
  function plan(archive, records, scope) {
    const entries=Array.isArray(archive?.entries)?archive.entries:[];
    const expectedCount=Number(archive?.num_entries);
    const complete=Array.isArray(archive?.entries) && Number.isSafeInteger(expectedCount) &&
      expectedCount>=0 && entries.length>=expectedCount;
    const current = new Map((records || []).filter(r=>r?.detailId).map(r=>[r.detailId,r]));
    const grouped=new Map();
    for(const entry of entries.slice(0,2000)) {
      const value=parse(entry,scope);
      if(!value)continue;
      const group=grouped.get(value.detailId)||[];group.push(value);grouped.set(value.detailId,group);
    }
    const actions=[],stats={scanned:entries.length,matched:grouped.size,recover:0,reconnect:0,
      duplicates:0,conflicts:0,alreadyLinked:0,complete};
    for(const [detailId,variants] of grouped) {
      if(variants.length!==1){stats.duplicates++;continue;}
      const entry=variants[0], existing=current.get(detailId);
      if(!existing){stats.recover++;actions.push({kind:'recover',entry});continue;}
      if(existing.content!==entry.content){stats.conflicts++;continue;}
      const remote=existing.remote||{};
      if(remote.bookId && String(remote.bookId).toLowerCase()!==String(archive.id).toLowerCase()){
        stats.conflicts++;continue;
      }
      if(remote.id && String(remote.id).toLowerCase()!==entry.id){stats.conflicts++;continue;}
      if(remote.id && remote.status==='confirmed' && !remote.stale){stats.alreadyLinked++;continue;}
      stats.reconnect++;actions.push({kind:'reconnect',entry});
    }
    return {stats,actions};
  }
  function packageEntry(record,scope) {
    const data={schema:'dsq-lorebook-archive/v2',botId:scope.botId,conversationId:scope.conversationId,
      detailId:record.detailId,sourceMessageId:record.sourceMessageId||'',
      name:record.name||'',keywords:Array.isArray(record.keywords)?record.keywords.slice(0,12):[],content:record.content};
    const content=JSON.stringify(data);
    if(content.length>2000) throw new Error('Archive entry exceeds SpicyChat’s 2,000-character limit. Kept locally only.');
    return content;
  }
  DS.privateLorebookRecovery=Object.freeze({parse,plan,packageEntry});
})();
