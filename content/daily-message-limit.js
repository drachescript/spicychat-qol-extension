// Passive, opt-in daily message cap status. No API polling or test generations.
// Native 2,000-message error detection is the only automatic cap trigger.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const KEY = 'dsQolDailyMessageLimitV1';
  const PANEL_ID = 'ds-qol-daily-message-limit';
  const ERROR = /(?:you(?:'|’)?ve\s+hit\s+your\s+2[,.]?000\s+daily\s+message\s+limit|2[,.]?000\s+daily\s+message\s+limit)/i;
  const RESET_TEXT = /messages?\s+reset\s+tomorrow\s+at\s+midnight/i;
  let observed = null;
  let lastProbeAt = 0;
  let lastKnownText = '';
  let observer = null;
  let updateTimer = null;
  let activePanel = null;
  let loaded = false;

  const onChat = () => /^\/(?:[a-z]{2}\/)?chat\//i.test(location.pathname);
  const enabled = () => DS.state?.settings?.enabled !== false && DS.state?.settings?.dailyMessageLimitTrackerEnabled === true && !window.__DSQ_TAB_GATE__?.paused;
  const nextLocalMidnight = date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  const format = at => new Date(at).toLocaleString(undefined, {year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  const countdown = ms => {
    const mins = Math.max(0, Math.ceil(ms / 60000));
    const h = Math.floor(mins / 60), m = mins % 60;
    return h ? `${h}h ${m}m` : `${m}m`;
  };
  const apply = () => {
    if (!enabled() || !onChat() || !observed?.hitAt || observed?.dismissedUntilReload) { activePanel?.remove(); activePanel = null; return; }
    if (!activePanel?.isConnected) {
      activePanel = document.createElement('section');
      activePanel.id = PANEL_ID;
      activePanel.setAttribute('role','status');
      activePanel.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147482400;background:#181b22;color:#e9eef5;border:1px solid #596272;border-radius:9px;padding:9px 11px;max-width:min(345px,calc(100vw - 30px));font:12px/1.45 system-ui,sans-serif;box-shadow:0 5px 19px #0008';
      const title = document.createElement('strong'); title.textContent = 'SpicyChat daily message limit';
      const body = document.createElement('div');body.dataset.dsLimitBody='1';
      const control = document.createElement('button');control.type='button';control.textContent='I can send messages again';
      control.style.cssText = 'margin-top:6px;padding:4px 7px;cursor:pointer;border-radius:5px;border:1px solid #778395;color:inherit;background:#29313e;font:inherit';
      control.addEventListener('click', async () => {
        if (!observed?.hitAt) return;
        const next = {...observed, accessibleAt: Date.now(), confirmedBy: 'user-observation'};
        observed = next;
        await persist();
        apply();
      });
      const dismiss = document.createElement('button');dismiss.type='button';dismiss.textContent='×';dismiss.title='Dismiss until next reload';
      dismiss.style.cssText='float:right;background:none;color:inherit;border:0;font-size:17px;cursor:pointer';
      dismiss.addEventListener('click',()=>{activePanel?.remove();activePanel=null;observed={...observed,dismissedUntilReload:true};});
      activePanel.append(dismiss,title,body,control);
      document.body.append(activePanel);
    }
    const body = activePanel.querySelector('[data-ds-limit-body]');
    const button = activePanel.querySelector('button:not(:first-child)');
    if (observed.accessibleAt) {
      body.textContent = `Limit was observed at ${format(observed.hitAt)}. You confirmed messages worked again at ${format(observed.accessibleAt)}. No exact reset timestamp was supplied by SpicyChat.`;
      if (button) button.hidden = true;
      return;
    }
    const remaining = observed.estimatedResetAt - Date.now();
    body.textContent = `${remaining > 0 ? `About ${countdown(remaining)} until` : 'Past'} the estimated local-midnight reset (${format(observed.estimatedResetAt)}). This is an estimate based on your device's timezone, NOT a confirmed SpicyChat reset. No messages are being sent to check.`;
    if (button) button.hidden = false;
  };
  async function persist() {
    try { await chrome.storage.local.set({[KEY]:observed}); } catch {}
  }
  function see(text) {
    if (!enabled() || !onChat()) return;
    const value = String(text||'').slice(0,1800);
    if (!ERROR.test(value)) return; // A generic HTTP 429 is never the daily cap.
    if (value === lastKnownText && Date.now() - lastProbeAt < 30000) return;
    lastProbeAt = Date.now();lastKnownText=value;
    const now = Date.now();
    if (observed?.hitAt && !observed.accessibleAt && now-observed.hitAt<30*60*1000) return;
    const date = new Date(now);
    observed = {version:1,hitAt:now,estimatedResetAt:nextLocalMidnight(date),resetTextObserved:RESET_TEXT.test(value),confirmedBy:null};
    persist();apply();
  }
  function inspect(node) {
    if (!node || !enabled() || !onChat()) return;
    if (node.nodeType===3) {see(node.textContent);return;}
    if (node.nodeType!==1) return;
    // Don't read whole chat trees; only small newly inserted UI elements.
    if (node.childElementCount<=8 && (node.textContent||'').length<=1800) see(node.textContent);
    if (node.matches?.('[role="alert"], [data-sonner-toast], [data-testid*="toast" i]')) see(node.textContent);
  }
  function start() {
    if (loaded || !document.body) return;
    loaded=true;
    chrome.storage.local.get([KEY],raw=>{
      if (chrome.runtime.lastError) return;
      const item=raw?.[KEY];
      if (item?.version===1 && Number.isFinite(item.hitAt) && Date.now()-item.hitAt<7*86400000) observed=item;
      apply();
    });
    const selectors = 'p.text-red-12, [role="alert"], [data-sonner-toast], [data-testid*="toast" i], [role="status"]';
    document.querySelectorAll(selectors).forEach(inspect);
    observer = new MutationObserver(records=>{
      if (!enabled() || !onChat()) return;
      for (const mutation of records) {
        for (const node of mutation.addedNodes) inspect(node);
      }
    });
    observer.observe(document.body,{childList:true,subtree:true});
    updateTimer=setInterval(() => {
      if (enabled() && onChat() && !observed?.hitAt)
        document.querySelectorAll('p.text-red-12, [role="alert"]').forEach(inspect);
      apply();
    },60000);
    DS.updateDailyMessageLimitStatus=apply;
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
