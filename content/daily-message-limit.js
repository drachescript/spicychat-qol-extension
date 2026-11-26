// Generation usage research; preserve the existing user's enable setting.
// Local observations and clearly labelled support-based estimates; never block native generation.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  'use strict';
  const DS=window.DragonScriptQoL;
  if(!DS||DS.isQolWorkerTab?.())return;
  const SOURCE='spicychat-qol-generation-quota', PANEL_ID='ds-qol-daily-message-limit', BUTTON_ID='ds-qol-generation-quota-button';
  const LIMITS=Object.freeze({free:2000,paid_minimal:2000,paid_basic:5000,paid_premium:5000});
  const NAMES=Object.freeze({free:'Free',paid_minimal:'Get A Taste',paid_basic:'True Supporter',paid_premium:'All-In'});
  let account=null,accountPending=null,epoch=0,lastVerify=0,lastHeader=null,observedAccountKey=null,lastRender=0,summary=null,refreshPending=null,timer=null,button=null,panel=null,storageError=false,missed=0,started=false;
  let noticeSeen=false,noticeAbsentAt=0,lastNoticeScan=0,nativeNotice=null,noticeWasAbsent=false;
  const SUPPORT_WINDOW=24*60*60*1000;
  const enabled=()=>DS.state?.settings?.enabled===true&&DS.state.settings.dailyMessageLimitTrackerEnabled===true&&!window.__DSQ_TAB_GATE__?.paused;
  const onChat=()=>!!(DS.isSingleChatPage?.()||/^\/(?:[a-z]{2}\/)?chat\//i.test(location.pathname));
  const now=()=>Date.now();
  const fmt=t=>t?new Date(t).toLocaleString():'Unknown';
  const runtime=(action,key,extra={})=>new Promise((resolve,reject)=>{
    let settled=false;const finish=(r,e)=>{if(settled)return;settled=true;clearTimeout(timeout);e?reject(Error(e)):resolve(r);};
    const timeout=setTimeout(()=>finish(null,'Local observation storage did not respond'),15000);
    try{chrome.runtime.sendMessage({type:'DS_GENERATION_QUOTA_RESEARCH',action,accountKey:key,...extra},r=>{const e=chrome.runtime.lastError?.message;finish(r,e||(!r?.ok?r?.error||'Local observation storage unavailable':null));});}catch(e){finish(null,String(e?.message||e));}
  });
  function headerIdentity(){
    const header=document.querySelector('[data-testid="UserAccountLink"]');
    if(!header)return null;
    // Ephemeral DOM-change detection only; avatar URL is never stored/exported.
    return (header.querySelector('img')?.getAttribute('src')||'')+'|'+(DS.nativeSubscriptionTier?.()||'');
  }
  function invalidate(){epoch++;account=null;accountPending=null;summary=null;lastVerify=0;noticeSeen=false;nativeNotice=null;lastNoticeScan=0;noticeAbsentAt=0;noticeWasAbsent=false;DS.invalidateSubscriptionSnapshot?.();}
  function checkHeader(){const h=headerIdentity();if(lastHeader!==null&&h!==null&&h!==lastHeader){observedAccountKey=null;invalidate();}lastHeader=h;}
  function getAccount(force=false){
    checkHeader();if(accountPending)return accountPending;
    if(account&&!force&&now()-lastVerify<5*60*1000)return Promise.resolve(account);
    if(!enabled()||!onChat()||typeof DS.readSubscriptionSnapshot!=='function'||now()-lastVerify<30000)return Promise.resolve(account);
    lastVerify=now();const e=epoch;
    const p=DS.readSubscriptionSnapshot({force}).then(snapshot=>{
      if(e!==epoch||!enabled())return null;
      if(!snapshot?.accountKey||(observedAccountKey&&snapshot.accountKey!==observedAccountKey)){account=null;summary=null;return null;}
      if(account&&account.accountKey!==snapshot.accountKey){epoch++;summary=null;}
      account={...snapshot,verifiedAt:account?.accountKey===snapshot.accountKey?account.verifiedAt:snapshot.verifiedAt};return account;
    }).catch(()=>{if(e===epoch){account=null;summary=null;}return null;}).finally(()=>{if(accountPending===p)accountPending=null;});
    accountPending=p;return p;
  }
  function remove(){button?.remove();panel?.remove();button=null;panel=null;}
  function elapsed(t){const minutes=Math.max(0,Math.floor((now()-t)/60000));return `${Math.floor(minutes/60)}h ${minutes%60}m`;}
  function tier(){return account?.tier||DS.nativeSubscriptionTier?.()||null;}
  function recoveryEstimate(s,at=now()){
    if(!s?.lastRestriction||(s.lastSuccess&&s.lastSuccess>=s.lastRestriction.at))return null;
    // A notice rediscovered after reload must not replace the earlier saved
    // restriction. A prior generic 429 is only a possible quota onset.
    const start=s.episodeRequestAt||s.episodeStart||s.quotaNoticeAt||s.lastRestriction.at;
    if(!Number.isFinite(start)||start<=0)return null;
    const deadline=start+SUPPORT_WINDOW,minutes=Math.max(0,Math.ceil((deadline-at)/60000));
    return {start,deadline,expired:deadline<=at,remaining:`${Math.floor(minutes/60)}h ${minutes%60}m`,explicit:!!s.quotaNoticeAt,earlierAmbiguous:!!s.quotaNoticeAt&&start<s.quotaNoticeAt};
  }
  function noticeLimit(text){
    const match=/^you(?:'|’)ve hit your (2[,.]?000|5[,.]?000) daily message limit\.?(?: your messages reset tomorrow at midnight\.?)?$/i.exec(String(text||'').trim().replace(/\s+/g,' '));
    return match?Number(match[1].replace(/[,.]/g,'')):null;
  }
  function scanNotice(force=false){
    if(!enabled()||!onChat()||document.hidden)return null;
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
    const cap=LIMITS[tier()],used=summary?.success,restriction=summary?.lastRestriction&&(!summary.lastSuccess||summary.lastRestriction.at>summary.lastSuccess);
    const estimate=account&&!storageError?recoveryEstimate(summary):null;
    const label=storageError||!account?'?':!summary?'…':restriction?'◷':cap&&used>=cap*0.9?'!': '◔';
    button.textContent=estimate?(estimate.explicit?(estimate.expired?'◷ est. passed':`◷ ~${estimate.remaining}`):'◷ ?'):`${label}${Number.isInteger(used)?' '+used.toLocaleString():''}`;
    button.style.color=restriction||cap&&used>=cap*0.9?'#f3b34c':'inherit';
    button.title=`Generation usage — ${Number.isInteger(used)?used.toLocaleString()+' confirmed observations in the last 24h':'coverage not available'}; not a server quota counter. Tap for details.`;
    if(estimate)button.title+=` ${estimate.explicit?'Quota notice observed.':'Possible rate limit or quota restriction.'} ${estimate.expired?'Estimated 24h window passed; recovery unconfirmed.':`Support-based 24h estimate${estimate.explicit?'':' if this is quota exhaustion'}: ${estimate.remaining}. May recover earlier; not guaranteed.`}${estimate.earlierAmbiguous?' Earlier generic restriction used as a possible starting point.':''}`;
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
    action('Clear observations',async()=>{const key=account?.accountKey;if(!key||!enabled()||!confirm('Clear this account’s locally saved generation observations? No chats or SpicyChat data will be changed.'))return;try{await runtime('clear',key);if(account?.accountKey===key){summary=null;missed=0;noticeSeen=true;noticeWasAbsent=false;void refresh();}}catch{storageError=true;render();}});
    panel.append(close,title,text,actions);document.body.append(panel);button.setAttribute('aria-expanded','true');renderPanel();
  }
  function renderPanel(){
    const body=panel?.querySelector('[data-role="details"]');if(!body)return;
    const plan=tier(),cap=LIMITS[plan];let lines=[`Plan: ${NAMES[plan]||'Unknown'}${cap?' · '+cap.toLocaleString()+' generation limit':''}`];
    if(!account)lines.push('Account identity not verified. No observations are attributed to an unverified account.');
    if(storageError)lines.push('Local observation storage unavailable; some observations may be missing.');
    if(summary){lines.push(`Last 24h observed: ${summary.success.toLocaleString()} successful · ${summary.failed.toLocaleString()} failed · ${summary.unconfirmed.toLocaleString()} unconfirmed`,`Tracking started: ${fmt(summary.trackingStart)} · Coverage: partial`);
      lines.push(`Last confirmed generation: ${fmt(summary.lastSuccess)}`);
      if(summary.lastSavedReplyAt)lines.push(`Latest saved AI reply seen in chat history: ${fmt(summary.lastSavedReplyAt)} (not counted as a new generation)`);
      if(summary.lastRestriction){lines.push(`Last restriction: ${fmt(summary.lastRestriction.at)} (${summary.lastRestriction.source==='native-limit-notice'?'native daily-limit notice':summary.lastRestriction.code||'HTTP '+summary.lastRestriction.status})`);
        const estimate=recoveryEstimate(summary);
        if(estimate){lines.push(`First observed restriction: ${fmt(estimate.start)} · ${elapsed(estimate.start)} elapsed`,
          estimate.explicit?'Native quota notice observed.':'Possible temporary rate limit or quota restriction.',
          estimate.expired?'The estimated 24-hour window has passed; recovery has not been observed.':`Estimated time until the stated 24-hour window ends${estimate.explicit?'':' (if this is quota exhaustion)'}: ${estimate.remaining} (${fmt(estimate.deadline)})`,
          estimate.earlierAmbiguous?'Estimate uses the earlier ambiguous restriction; the actual quota onset may be later.':(!summary.lastSuccess?'No confirmed earlier generation available; the true limit-hit time may precede this observation.':'Based on locally observed restriction timing, not a server reset time.'), 'You may recover earlier; no guaranteed latest recovery time.');
          const latest=Math.max(summary.lastSuccess||0,summary.lastSavedReplyAt||0);
          if(latest&&latest<estimate.start&&estimate.start-latest< SUPPORT_WINDOW){
            lines.push(`If the limit was reached on that last observed reply, the 24-hour window could end around ${fmt(latest+SUPPORT_WINDOW)}. This earlier time is only a possibility.`);
          }}
        else lines.push(`First observed success after that restriction: ${fmt(summary.firstSuccessAfterRestriction||summary.lastSuccess)}`);}
      if(cap&&summary.success>=cap*0.9)lines.push('Observed activity is near or above the subscription limit; the actual quota window is not confirmed.');
    }
    if(missed)lines.push(`${missed} observations were not stored in this tab.`);
    lines.push('No authoritative remaining quota. Other devices and unobserved sessions are not included. No generation is blocked. Research history retained for 14 days.');
    body.textContent=lines.join('\n');
  }
  async function refresh(){
    if(!enabled()||!onChat()){remove();return;}
    if(document.hidden)return;
    if(refreshPending)return refreshPending;
    const p=(async()=>{await getAccount();const key=account?.accountKey;if(key){try{
      const notice=scanNotice(true);
      if(notice&&!noticeSeen&&enabled()&&onChat()&&account?.accountKey===key){await runtime('nativeNotice',key,{limit:notice.limit,fresh:noticeWasAbsent});if(account?.accountKey===key){noticeSeen=true;noticeWasAbsent=false;}}
      const r=await runtime('summary',key);if(account?.accountKey===key&&enabled()){summary=r;storageError=false;}
    }catch{storageError=true;}}else scanNotice(true);render();})();
    refreshPending=p;try{await p;}finally{if(refreshPending===p)refreshPending=null;}
  }
  function queueRefresh(){if(timer||document.hidden)return;timer=setTimeout(()=>{timer=null;void refresh();},1000);}
  window.addEventListener('message',event=>{
    if(event.source!==window||event.data?.source!==SOURCE||!enabled())return;
    const data=event.data;
    if(data.type==='account'){
      if(typeof data.accountKey==='string'&&/^[0-9a-f]{64}$/.test(data.accountKey)){
        if((account&&account.accountKey!==data.accountKey)||(observedAccountKey&&observedAccountKey!==data.accountKey)){invalidate();queueRefresh();}
        observedAccountKey=data.accountKey;
      }
      return;
    }
    if(data.type==='history-time'){
      checkHeader();const key=account?.accountKey;
      // No attribution for a history request that started before we verified
      // this account or for an old reply delivered after an account switch.
      if(key&&Number.isSafeInteger(data.startedAt)&&data.startedAt>=account.verifiedAt&&Number.isSafeInteger(data.replyAt)&&data.replyAt<=now())
        void runtime('historyTime',key,{replyAt:data.replyAt}).then(()=>queueRefresh(),()=>{});
      return;
    }
    if(data.type!=='generation')return;
    checkHeader();const row=data.payload,key=account?.accountKey;
    if(!key||!row||row.startedAt<account.verifiedAt){missed++;queueRefresh();return;}
    // Events are attached to a verified account observed before the request.
    // No full request or response body, message ID, or account identity is exported.
    void runtime('record',key,{event:{id:row.id,startedAt:row.startedAt,at:row.at,status:row.status,outcome:row.outcome,code:row.code,kind:row.kind,reason:row.reason,headers:row.headers,tier:tier()}}).then(()=>queueRefresh(),()=>{missed++;storageError=true;queueRefresh();});
  });
  // Account changes invalidate the scope before accepting further observations.
  window.addEventListener('storage',event=>{if(/firebase|(?:^|[-_:])auth(?:$|[-_:])|access.?token|id.?token/i.test(String(event.key||''))){observedAccountKey=null;invalidate();queueRefresh();}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkHeader();void refresh();}});
  window.addEventListener('popstate',()=>{if(!onChat())remove();else void refresh();});
  DS.updateDailyMessageLimitStatus=()=>{if(!enabled()){if(account||accountPending)invalidate();remove();return;}if(!onChat()){remove();return;}if(now()-lastRender<1000)return;lastRender=now();if(!button?.isConnected)render();const notice=scanNotice();if(!account||!summary||(notice&&!noticeSeen))queueRefresh();};
  function start(){if(started)return;started=true;void refresh();setInterval(()=>{if(enabled()&&onChat()&&!document.hidden)void refresh();else if(!enabled()||!onChat()){if(!enabled()&&(account||accountPending))invalidate();remove();}},60000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
