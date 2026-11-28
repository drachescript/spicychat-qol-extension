// Generation usage research; preserve the existing user's enable setting.
// Local observations and clearly labelled support-based estimates; never block native generation.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  'use strict';
  const DS=window.DragonScriptQoL;
  if(!DS||DS.isQolWorkerTab?.())return;
  const SOURCE='spicychat-qol-generation-quota', PANEL_ID='ds-qol-daily-message-limit', BUTTON_ID='ds-qol-generation-quota-button';
  const LIMITS=Object.freeze({free:2000,paid_minimal:2000,paid_basic:5000,paid_premium:5000});
  const NAMES=Object.freeze({free:'Free',paid_minimal:'Get A Taste',paid_basic:'True Supporter',paid_premium:'All-In'});
  let account=null,accountPending=null,epoch=0,lastHeader=null,lastRender=0,summary=null,refreshPending=null,timer=null,button=null,panel=null,storageError=false,missed=0,started=false;
  let minPassiveAt=0;
  let noticeSeen=false,noticeAbsentAt=0,lastNoticeScan=0,nativeNotice=null,noticeWasAbsent=false,noticeRoute=null;
  const SUPPORT_WINDOW=24*60*60*1000;
  const enabled=()=>DS.state?.settings?.enabled===true&&DS.state.settings.dailyMessageLimitTrackerEnabled===true&&!window.__DSQ_TAB_GATE__?.paused;
  const onChat=()=>!!(DS.isSingleChatPage?.()||/^\/(?:[a-z]{2}\/)?chat\//i.test(location.pathname));
  const now=()=>Date.now();
  const fmt=t=>t?new Date(t).toLocaleString():'Unknown';
  let inspectorSignature='',inspectorSummary=null,inspectorPrevious=null;
  const resetInspectorEmission=()=>{inspectorSignature='';inspectorPrevious=null;};
  const inspectorRecording=()=>DS.isDiagnosticTraceActive?.('normal')===true&&['normal','deep'].includes(DS.getDiagnosticTraceLevel?.());
  const runtime=(action,key,extra={})=>new Promise((resolve,reject)=>{
    const requestEpoch=epoch;
    let settled=false;const finish=(r,e)=>{if(settled)return;settled=true;clearTimeout(timeout);e?reject(Error(e)):resolve(r);};
    const timeout=setTimeout(()=>finish(null,'Local observation storage did not respond'),15000);
    try{chrome.runtime.sendMessage({type:'DS_GENERATION_QUOTA_RESEARCH',action,accountKey:key,...extra,quotaDiagnostic:inspectorRecording()},r=>{const e=chrome.runtime.lastError?.message;const error=e||(!r?.ok?r?.error||'Local observation storage unavailable':null);try{if(!settled&&!error&&requestEpoch===epoch&&account?.accountKey===key&&enabled()&&onChat()){const committed=action==='summary'?r:r.quotaState;if(committed){inspectorSummary=committed;emitInspectorQuotaState(committed);}}}catch{}finally{finish(r,error);}});}catch(e){finish(null,String(e?.message||e));}
  });
  const validKey=k=>typeof k==='string'&&/^[0-9a-f]{64}$/.test(k);
  const boundScopes=new Map(), pendingWrites=new Map();
  let latestScopeAt=0,traceSignature='',writeErrors=0,readErrors=0,unattributed=0,scopeGap=0,lastScopeInfo='';
  function headerIdentity(){const header=document.querySelector('[data-testid="UserAccountLink"]');return header?{avatar:header.querySelector('img')?.getAttribute('src')||'',tier:DS.nativeSubscriptionTier?.()||''}:null;}
  function invalidate(){epoch++;account=null;accountPending=null;summary=null;noticeSeen=false;nativeNotice=null;lastNoticeScan=0;noticeAbsentAt=0;noticeWasAbsent=false;traceSignature='';resetInspectorEmission();inspectorSummary=null;}
  function checkHeader(){const h=headerIdentity();if(lastHeader?.avatar&&h?.avatar&&h.avatar!==lastHeader.avatar){latestScopeAt=now();minPassiveAt=now();invalidate();}if(h)lastHeader=h;}
  function setScope(key,at,plan,source){
    if(!validKey(key)||at<latestScopeAt)return;
    latestScopeAt=at;if(account?.accountKey!==key){invalidate();account={accountKey:key,verifiedAt:at,tier:plan||null,tierSource:source};}
    else if(plan){account.tier=plan;account.tierSource=source;}
  }
  function bindScope(key,canonicalKey){
    if(!validKey(key)||!validKey(canonicalKey)||boundScopes.get(key)===canonicalKey)return;
    boundScopes.set(key,canonicalKey);
    void runtime('bind',key,{canonicalKey}).then(()=>queueRefresh(),()=>{boundScopes.delete(key);writeErrors++;storageError=true;queueRefresh();});
  }
  function passiveAccount(){
    if(!enabled()||!onChat())return null;
    let result=null;const requestId=crypto.randomUUID(),name='ds-qol-quota-profile-response-v1';
    const read=e=>{if(e.detail?.requestId===requestId)result=e.detail;};
    try{window.addEventListener(name,read);window.dispatchEvent(new CustomEvent('ds-qol-quota-profile-read-v1',{detail:{requestId}}));}catch{}finally{window.removeEventListener(name,read);}
    if(!result)return account;
    if(validKey(result.scopeKey)&&validKey(result.accountKey))bindScope(result.scopeKey,result.accountKey);
    if(result.invalidatedAt&&account&&account.verifiedAt<=result.invalidatedAt){invalidate();if(!(validKey(result.scopeKey)&&result.scopeAt>result.invalidatedAt))return null;}
    if(validKey(result.scopeKey)&&result.scopeAt>=minPassiveAt){
      // This is the current native bearer scope, not a guessed identity from UI.
      const native=DS.nativeSubscriptionTier?.();setScope(result.scopeKey,account?.accountKey===result.scopeKey?latestScopeAt:result.scopeAt,native||result.tier||null,native?'native-header':'native-profile');
    }else if(validKey(result.accountKey)&&result.verifiedAt>=minPassiveAt&&!account){setScope(result.accountKey,result.verifiedAt,result.tier,'native-profile');}
    return account;
  }
  async function getAccount(){checkHeader();return passiveAccount();}
  // Exact Inspector quota-state-v1 allowlist. Never spread a ledger row,
  // account scope, diagnostic trace, headers or arbitrary error text.
  function inspectorQuotaState(s,at,errors,unavailable=false){
    const e=s?.episode,plan=Object.hasOwn(LIMITS,s?.tier)?s.tier:null;
    const number=v=>Number.isSafeInteger(v)&&v>=0?v:null;
    const stamp=v=>Number.isSafeInteger(v)&&v>0?v:null;
    const initial=stamp(e?.start);
    const deadline=e?.quotaEvidence&&!e.uncertainAnchor&&initial?initial+SUPPORT_WINDOW:null;
    const id=typeof e?.id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.id)?'qc-'+e.id.replace(/-/g,'').toLowerCase():null;
    const tiers={free:'free',paid_minimal:'get-a-taste',paid_basic:'true-supporter',paid_premium:'all-in'};
    const reasons={'initial-restriction':'initial-restriction','repeated-rejection':'repeat-restriction','partial-recovery-restricted':'partial-recovery-restricted','observed-recovery':'observed-recovery','sustained-recovery':'sustained-recovery','full-observed-allowance':'full-observed-allowance','restriction-after-sustained-recovery':'restriction-after-sustained-recovery','legacy-incomplete-cycle-evidence':'legacy-incomplete-cycle-evidence','manual-estimate-reset':'manual-estimate-reset'};
    const expired=!!(e?.active&&deadline&&deadline<=at);
    const restrictionState=unavailable||!s?'unknown':e?.active?(expired?'awaiting-confirmation':'restricted'):e?.firstRecoveryAt&&!e.sustainedAt?'partial-recovery':'available';
    return {tier:plan?tiers[plan]:'unknown',quotaCeiling:plan?LIMITS[plan]:null,retainedGenerationCount:number(s?.retainedSuccess),observed24hCount:number(s?.success),estimatedCycleCount:number(s?.observedUsage),coverage:'partial',
      restrictionState,classification:e?.active&&e.quotaEvidence?'suspected-quota':'unknown',
      initialRestrictionAt:initial,latestRestrictionAt:stamp(e?.lastRestrictionAt??e?.lastRejectionAt),estimatedDeadline:deadline,firstRecoveryAt:stamp(e?.firstRecoveryAt),sustainedRecoveryAt:stamp(e?.sustainedAt),
      // Logical countdown state, not physical visibility of a hidden tab.
      countdownVisible:!!(!unavailable&&e?.active&&deadline&&deadline>at),transitionReason:unavailable?'storage-error':Object.hasOwn(reasons,s?.cycleReason)?reasons[s.cycleReason]:'restored',
      prunedCount:number(s?.removed),deduplicatedCount:number(s?.duplicates),storageErrors:number(errors),...(id?{cycleRef:id}:{})};
  }
  function emitInspectorQuotaState(s,unavailable=false){
    if(!enabled()||!onChat()||!account||!inspectorRecording()){resetInspectorEmission();return;}
    const state=inspectorQuotaState(s,now(),readErrors+writeErrors,unavailable);
    // Cycle reasons persist in storage after a transition. Separate the reason
    // from the emission signature so a count checkpoint cannot replay a reset.
    const {transitionReason:reason,...values}=state;
    const {retainedGenerationCount,observed24hCount,estimatedCycleCount,...semantic}=values;
    const marker=JSON.stringify([s?.cycleReason??null,s?.usageStartKind==='manual'?s.usageStart:null]);
    const semanticSignature=JSON.stringify(semantic);
    const bucket=v=>v===null?null:Math.floor(v/100);
    const signature=JSON.stringify([semanticSignature,marker,bucket(retainedGenerationCount),bucket(observed24hCount),bucket(estimatedCycleCount)]);
    if(signature===inspectorSignature)return;
    const previous=inspectorPrevious;
    const cycleChanged=previous&&(marker!==previous.marker||['cycleRef','initialRestrictionAt','latestRestrictionAt','firstRecoveryAt','sustainedRecoveryAt','classification','estimatedDeadline'].some(k=>semantic[k]!==previous.semantic[k]));
    const expired=state.restrictionState==='awaiting-confirmation';
    if(unavailable||state.storageErrors>(previous?.semantic.storageErrors??0))state.transitionReason='storage-error';
    else if(cycleChanged||(!previous&&['state-change','manual-estimate-reset','native-limit-notice'].includes(s?.diagnosticTrigger)))state.transitionReason=reason;
    else if(previous&&(state.tier!==previous.semantic.tier||state.quotaCeiling!==previous.semantic.quotaCeiling))state.transitionReason='tier-change';
    else if(expired&&(!previous||previous.semantic.restrictionState!=='awaiting-confirmation'))state.transitionReason='estimate-expired';
    else if(previous&&semanticSignature===previous.semanticSignature)state.transitionReason='observation-checkpoint';
    else if(previous)state.transitionReason=previous.semantic.restrictionState==='unknown'?'restored':'unknown';
    // First snapshot preserves a known transition unless an already-expired
    // estimate is the only evidence. No timestamp or count is rounded on wire.
    try{window.postMessage({source:SOURCE,type:'quota-state-v1',state},location.origin);inspectorSignature=signature;inspectorPrevious={semantic,semanticSignature,marker};}catch{}
  }
  DS.onGenerationQuotaDiagnosticSession=active=>{resetInspectorEmission();if(active&&(inspectorSummary||summary))emitInspectorQuotaState(inspectorSummary||summary,storageError);};
  function reportState(force=false){
    if(!summary&&!force)return;
    if(storageError)emitInspectorQuotaState(inspectorSummary||summary,true);
    const s=summary||{},e=s.episode,plan=tier();
    const snapshot={scope:s.scopeLabel||null,scopeLinked:!!s.scopeLinked,tier:plan,tierEvidence:account?.tierSource||s.tierEvidence||null,ceiling:LIMITS[plan]||s.ceiling||null,retained:s.retained??null,retainedSuccess:s.retainedSuccess??null,observed24h:s.success??null,lifetime:s.lifetimeSuccess??null,estimatedUsage:s.observedUsage??null,coverage:'partial',coverageGaps:s.coverageGaps||0,tabWriteGaps:scopeGap,unattributed,restriction:e?.active?(e.quotaEvidence?'suspected-quota':'unknown-rate-limit'):'not-observed',cycleId:e?.id||null,initialRestriction:e?.start||null,latestRejection:e?.lastRejectionAt||null,deadline:e?.quotaEvidence&&!e.uncertainAnchor?e.start+SUPPORT_WINDOW:null,firstRecovery:e?.firstRecoveryAt||null,sustainedRecovery:e?.sustainedAt||null,recoverySuccesses:e?.successes||0,cycleReason:s.cycleReason||null,readErrors,writeErrors,deduplicated:s.duplicates||0,removed:s.removed||0,pending:pendingWrites.size};
    const signature=JSON.stringify({...snapshot,retained:Math.floor((snapshot.retained||0)/100),retainedSuccess:Math.floor((snapshot.retainedSuccess||0)/100),observed24h:Math.floor((snapshot.observed24h||0)/100),lifetime:snapshot.lifetime===null?null:Math.floor(snapshot.lifetime/100),estimatedUsage:Math.floor((snapshot.estimatedUsage||0)/100),recoverySuccesses:Math.floor(snapshot.recoverySuccesses/100)});
    if(force||signature!==traceSignature){traceSignature=signature;DS.traceEvent?.('generation-quota','quota-state',snapshot,{critical:!!e?.active||!!readErrors||!!writeErrors});}
  }
  function storeObservation(key,row,plan){
    if(pendingWrites.has(row.id))return;
    if(pendingWrites.size>=256){scopeGap++;void runtime('gap',key,{count:1}).catch(()=>{});reportState(true);return;}
    const record={id:row.id,startedAt:row.startedAt,at:row.at,status:row.status,outcome:row.outcome,code:row.code,kind:row.kind,reason:row.reason,headers:row.headers,tier:plan};
    pendingWrites.set(row.id,record);
    const attempt=n=>runtime('record',key,{event:record}).then(()=>{pendingWrites.delete(row.id);if(account?.accountKey===key){if((row.outcome==='success'&&summary?.episode?.active)||(row.status===429&&!summary?.episode?.active))void refresh();queueRefresh();}},()=>{
      writeErrors++;storageError=true;reportState(true);
      if(n<2){setTimeout(()=>attempt(n+1),1000*(n+1));return;}
      pendingWrites.delete(row.id);missed++;scopeGap++;void runtime('gap',key,{count:1}).catch(()=>{});queueRefresh();
    });void attempt(0);
  }
  function receiveScoped(row){
    if(row.type==='bind'){bindScope(row.key,row.accountKey);return;}
    if(row.type==='scope'){
      if(validKey(row.key)&&Number.isSafeInteger(row.startedAt)){const changed=account?.accountKey!==row.key;const native=DS.nativeSubscriptionTier?.();setScope(row.key,row.startedAt,native,'native-header');if(changed||!summary)queueRefresh();}return;
    }
    if(row.type!=='generation'||!row.payload)return;
    if(!validKey(row.key)){unattributed++;missed++;reportState(true);queueRefresh();return;}
    // A response from an older account may finish after account switch. Its
    // request scope, not the visible header, determines the ledger destination.
    const plan=account?.accountKey===row.key?(DS.nativeSubscriptionTier?.()||account.tier):null;
    storeObservation(row.key,row.payload,plan);
  }
  function remove(){button?.remove();panel?.remove();button=null;panel=null;}
  function elapsed(t){const minutes=Math.max(0,Math.floor((now()-t)/60000));return `${Math.floor(minutes/60)}h ${minutes%60}m`;}
  function tier(){return account?.tier||summary?.tier||DS.nativeSubscriptionTier?.()||null;}
  function recoveryEstimate(s,at=now()){
    const e=s?.episode;
    if(!e?.active||!e.quotaEvidence||e.uncertainAnchor)return null;
    const start=e.start;
    if(!Number.isFinite(start)||start<=0)return null;
    const deadline=start+SUPPORT_WINDOW,minutes=Math.max(0,Math.ceil((deadline-at)/60000));
    return {start,deadline,expired:deadline<=at,remaining:`${Math.floor(minutes/60)}h ${minutes%60}m`,evidence:e.quotaEvidence};
  }
  function noticeLimit(text){
    const match=/^you(?:'|’)ve hit your (2[,.]?000|5[,.]?000) daily message limit\.?(?: your messages reset tomorrow at midnight\.?)?$/i.exec(String(text||'').trim().replace(/\s+/g,' '));
    return match?Number(match[1].replace(/[,.]/g,'')):null;
  }
  function scanNotice(force=false){
    if(!enabled()||!onChat()||document.hidden)return null;
    if(noticeRoute!==location.pathname){noticeRoute=location.pathname;noticeSeen=false;noticeWasAbsent=false;noticeAbsentAt=0;nativeNotice=null;lastNoticeScan=0;}
    if(!force&&now()-lastNoticeScan<5000)return nativeNotice;
    lastNoticeScan=now();nativeNotice=null;
    // Only known native warning/toast elements, never scan the conversation body.
    for(const node of document.querySelectorAll('[data-testid="ChatBubbleRequestErrorAlert"], [data-testid="ChatSendErrorBanner"], [data-testid="ChatSendErrorBanner"] p, p.text-red-12, [role="alert"], [data-sonner-toast], [data-testid*="toast" i]')){
      if(node.closest('[data-ds-owned], [data-testid="ChatMessageContentV2"], [data-testid="ChatBubble-Content"]'))continue;
      const message=node.closest('[id^="message-"], [data-message-id], [data-testid="message"], [data-testid="chat-message"], [data-testid="ChatMessageItem"]');
      // Native failed-send alerts can be nested in a placeholder ChatMessageItem
      // (message-undefined). Never accept quota text from a real message body.
      if(message&&!(message.id==='message-undefined'&&node.closest('[data-testid="ChatBubbleRequestErrorAlert"]')&&message.closest('[data-testid="ChatMessageList"]')))continue;
      const value=node.textContent||'';if(value.length>200)continue;
      const limit=noticeLimit(value);if(limit&&node.getClientRects().length){nativeNotice={node,limit};break;}
    }
    if(nativeNotice)noticeAbsentAt=0;
    else{if(!noticeAbsentAt)noticeAbsentAt=now();if(now()-noticeAbsentAt>=15000){noticeSeen=false;noticeWasAbsent=true;}}
    return nativeNotice;
  }
  function render(){
    if(!enabled()||!onChat()){remove();return;}
    if(document.hidden)return;
    const anchor=document.querySelector("button[aria-label='chat-dropdown']");
    const fallback=nativeNotice?.node?.isConnected?nativeNotice.node:null;
    if(!anchor?.parentElement&&!fallback?.parentElement){remove();return;}
    if(!button?.isConnected){
      button=document.createElement('button');button.type='button';button.id=BUTTON_ID;button.dataset.dsOwned='1';button.style.cssText='font:inherit;font-size:11px;line-height:1.3;flex:none;padding:3px 5px;border-radius:6px;border:1px solid currentColor;cursor:pointer;background:transparent;white-space:nowrap;';
      button.setAttribute('aria-expanded','false');button.onclick=()=>{if(panel?.isConnected){panel.remove();panel=null;button.setAttribute('aria-expanded','false');}else{openPanel();void refresh();}};
      if(anchor?.parentElement)anchor.parentElement.insertBefore(button,anchor);else fallback.insertAdjacentElement("afterend",button);
    }
    const cap=LIMITS[tier()],used=summary?.success,restriction=summary?.episode?.active===true;
    const estimate=account&&!storageError?recoveryEstimate(summary):null;
    const count=Number.isInteger(used)?used.toLocaleString()+(cap?' / '+cap.toLocaleString():''):'…';
    button.textContent=storageError||!account?'◔ ?':restriction?(estimate?(estimate.expired?'◷ est. passed':`◷ ~${estimate.remaining}`):'◷ ?'):`◔ ${count}`;
    button.style.color=restriction?'#f3b34c':'inherit';
    button.title=`Generation usage — ${count} locally observed (last 24h; partial coverage, not server remaining quota). Tap for details.`;
    if(restriction)button.title+=estimate?` Suspected quota restriction. ${estimate.expired?'Support-based estimate passed; awaiting observed recovery.':`Support-based estimated 24h reference: ${estimate.remaining}. Recovery may be earlier.`}`:' Rate limit observed; recovery time unknown (incomplete evidence).';
    button.setAttribute('aria-label',button.title);
    if(panel?.isConnected)renderPanel();
  }
  function openPanel(){
    if(!button?.isConnected)return;
    panel=document.createElement('section');panel.id=PANEL_ID;panel.dataset.dsOwned='1';panel.setAttribute('role','region');panel.setAttribute('aria-label','Generation usage tracker');
    panel.style.cssText='position:fixed;right:12px;top:70px;z-index:2147482400;background:#181b22;color:#e9eef5;border:1px solid #596272;border-radius:9px;padding:10px;max-width:min(360px,calc(100vw - 24px));font:12px/1.5 system-ui,sans-serif;box-shadow:0 5px 19px #0008';
    const title=document.createElement('strong');title.textContent='Generation usage · local research';
    const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Close generation details');close.style.cssText='float:right;background:none;border:0;color:inherit;cursor:pointer;font-size:16px';close.onclick=()=>{panel?.remove();panel=null;button?.setAttribute('aria-expanded','false');};
    const text=document.createElement('div');text.dataset.role='details';text.style.cssText='white-space:pre-wrap;margin:6px 0';
    const actions=document.createElement('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:5px';
    function action(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='background:#29313e;color:inherit;border:1px solid #778395;border-radius:5px;padding:4px 6px;cursor:pointer';b.onclick=fn;actions.append(b);return b;}
    action('Export observations',async()=>{const key=account?.accountKey;if(!key||!enabled())return;try{const r=await runtime('export',key);if(account?.accountKey!==key||!enabled())return;const blob=new Blob([JSON.stringify({format:'dsq-generation-research-v1',coverage:'partial',exportedAt:new Date().toISOString(),events:r.events},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='spicychat-generation-observations-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch{storageError=true;render();}});
    action('Reset estimated usage',async()=>{const key=account?.accountKey;if(!key||!enabled()||!confirm('Reset only the estimated usage counter? Recorded history and restriction evidence are retained.'))return;try{await runtime('resetEstimate',key);queueRefresh();}catch{storageError=true;render();}});
    action('Clear observations',async()=>{const key=account?.accountKey;if(!key||!enabled()||pendingWrites.size||!confirm('Clear this account’s locally saved generation observations? No chats or SpicyChat data will be changed.'))return;try{await runtime('clear',key);if(account?.accountKey===key){summary=null;missed=0;scopeGap=0;noticeSeen=true;noticeWasAbsent=false;void refresh();}}catch{storageError=true;render();}});
    panel.append(close,title,text,actions);document.body.append(panel);button.setAttribute('aria-expanded','true');renderPanel();
  }
  function renderPanel(){
    const body=panel?.querySelector('[data-role="details"]');if(!body)return;
    const plan=tier(),cap=LIMITS[plan];let lines=[`Plan: ${NAMES[plan]||'Unknown'}${cap?' · '+cap.toLocaleString()+' generation limit':''}`];
    if(!account)lines.push('Account identity not verified. No observations are attributed to an unverified account.');
    if(storageError)lines.push('Local observation storage unavailable; some observations may be missing.');
    if(summary&&!storageError&&account){
      const e=summary.episode,estimate=recoveryEstimate(summary);
      lines.push(`Estimated usage (${summary.usageStartKind==='sustained-recovery'?'estimated cycle':summary.usageStartKind==='manual'?'manual baseline':'since tracking began'}): ${summary.observedUsage.toLocaleString()}${cap?' / '+cap.toLocaleString():''}`,`Observed since: ${fmt(summary.usageStart)} · Coverage: partial`,`Last 24h observed: ${summary.success.toLocaleString()} successful · ${summary.failed.toLocaleString()} failed · ${summary.unconfirmed.toLocaleString()} unconfirmed`,`Total retained successful observations: ${(summary.retainedSuccess??summary.totalSuccess).toLocaleString()}`,`Tracking started: ${fmt(summary.trackingStart)}`,`Last confirmed generation: ${fmt(summary.lastSuccess)}`);
      if(summary.lastSavedReplyAt)lines.push(`Latest saved AI reply: ${fmt(summary.lastSavedReplyAt)} (not counted as a new generation)`);
      if(e){
        lines.push(`Initial restriction: ${fmt(e.start)}`,`Latest rejected generation: ${fmt(e.lastRejectionAt)}`,`Latest restriction evidence: ${fmt(e.lastRestrictionAt)}`);
        if(e.firstRecoveryAt)lines.push(`First observed recovery: ${fmt(e.firstRecoveryAt)}`,`Successful generations since initial restriction: ${e.successes.toLocaleString()}`);
        if(e.quotaEvidence&&!e.uncertainAnchor&&!e.active)lines.push(`Prior estimated reference: ${fmt(e.start+SUPPORT_WINDOW)} (not a confirmed reset)`);
        if(e.anchorUnverified)lines.push('Legacy restriction anchor cannot be verified from the retained history.');
        if(e.sustainedAt)lines.push(`Sustained recovery observed: ${fmt(e.sustainedAt)} (heuristic; full reset unconfirmed)`);
        if(e.active){
          lines.push(estimate?`Suspected quota exhaustion (${estimate.evidence==='native-notice'?'native daily-limit warning':'observed usage reached plan ceiling'}).`:e.quotaEvidence?'Suspected quota restriction; original deadline cannot be established.':'Rate limit observed; type and recovery time unknown.');
          if(estimate)lines.push(estimate.expired?'Support-based estimated 24-hour window passed; awaiting confirmation of recovery.':`Support-based estimated 24-hour reference: ${estimate.remaining} (${fmt(estimate.deadline)})`, 'No authoritative reset timestamp; recovery may occur earlier.');
        }else lines.push('Generation recovery observed; full quota reset is unconfirmed.');
        if(e.newCycle)lines.push('New estimated cycle inferred from a full ceiling of observed successes; server reset unconfirmed.');
      }
      if(summary.priorEpisode)lines.push(`Previous restriction: ${fmt(summary.priorEpisode.start)} · first recovery: ${fmt(summary.priorEpisode.firstRecoveryAt)}`);
    }
    if(summary&&!summary.scopeLinked)lines.push('This scope may not yet be linked to older profile-based history; earlier records remain saved.');
    if(summary)lines.push(`Retained records: ${summary.retained} · duplicate observations: ${summary.duplicates} · removed: ${summary.removed}`,`Known recording gaps: ${summary.coverageGaps||0}; unverified account observations this tab: ${unattributed}; pending writes: ${pendingWrites.size}.`);
    if(missed)lines.push(`${missed} observations were not stored in this tab.`);
    lines.push('No authoritative remaining quota. Other devices and unobserved sessions are not included. No generation is blocked. Timestamped observations are retained until explicitly cleared. Older previously expired records cannot be recovered.');
    body.textContent=lines.join('\n');
  }
  async function refresh(){
    if(!enabled()||!onChat()){remove();return;}
    if(document.hidden)return;
    if(refreshPending)return refreshPending;
    const p=(async()=>{await getAccount();const key=account?.accountKey;if(key){try{
      const plan=DS.nativeSubscriptionTier?.()||account.tier; const scopeInfo=key+':'+plan;if(plan&&lastScopeInfo!==scopeInfo){await runtime('scopeInfo',key,{tier:plan,tierEvidence:DS.nativeSubscriptionTier?.()?'native-header':'native-profile'});lastScopeInfo=scopeInfo;}
      const notice=scanNotice(true);
      if(notice&&!noticeSeen&&enabled()&&onChat()&&account?.accountKey===key){await runtime('nativeNotice',key,{limit:notice.limit,fresh:noticeWasAbsent});if(account?.accountKey===key){noticeSeen=true;noticeWasAbsent=false;}}
      const r=await runtime('summary',key);if(account?.accountKey===key&&enabled()){summary=r;storageError=false;reportState();}
    }catch{storageError=true;readErrors++;reportState(true);}}else scanNotice(true);render();})();
    refreshPending=p;try{await p;}finally{if(refreshPending===p)refreshPending=null;}
  }
  function queueRefresh(){if(timer||document.hidden)return;timer=setTimeout(()=>{timer=null;void refresh();},1000);}
  window.addEventListener('message',event=>{
    if(event.source!==window||event.data?.source!==SOURCE||!enabled())return;
    const data=event.data;
    if(data.type==='history-time'){
      // Historical saved replies are not charged generation evidence. Avoid
      // attribution across a scope switch; generation records use scoped events.
      const key=account?.accountKey;
      if(key&&Number.isSafeInteger(data.startedAt)&&data.startedAt>=account.verifiedAt&&Number.isSafeInteger(data.replyAt)&&data.replyAt<=now())
        void runtime('historyTime',key,{replyAt:data.replyAt}).then(()=>queueRefresh(),()=>{});
    }
  });
  window.__DSQ_QUOTA_RECEIVE__=receiveScoped;
  if(!window.__DSQ_QUOTA_BUFFER__)window.addEventListener('ds-qol-quota-scoped-v1',e=>{try{receiveScoped(JSON.parse(e.detail));}catch{}});
  const early=window.__DSQ_QUOTA_BUFFER__;
  if(early){unattributed+=early.dropped||0;for(const row of early.rows.splice(0))receiveScoped(row);early.dropped=0;}
  // Account changes invalidate the scope before accepting further observations.
  window.addEventListener('storage',event=>{if(/firebase|(?:^|[-_:])auth(?:$|[-_:])|access.?token|id.?token/i.test(String(event.key||''))){latestScopeAt=now();minPassiveAt=now();invalidate();queueRefresh();}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkHeader();void refresh();}});
  window.addEventListener('popstate',()=>{if(!onChat())remove();else void refresh();});
  DS.updateDailyMessageLimitStatus=()=>{if(!enabled()){if(account||accountPending)invalidate();remove();return;}if(!onChat()){remove();return;}if(now()-lastRender<1000)return;lastRender=now();if(!button?.isConnected)render();const notice=scanNotice();if(!account||!summary||(notice&&!noticeSeen))queueRefresh();};
  function start(){if(started)return;started=true;void refresh();setInterval(()=>{if(enabled()&&onChat()&&!document.hidden)void refresh();else if(!enabled()||!onChat()){if(!enabled()&&(account||accountPending))invalidate();remove();}},60000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
