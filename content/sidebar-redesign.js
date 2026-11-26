// Local navigation presentation only. Native links, menus and platform gates remain authoritative.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const ID = 'ds-qol-navigation-redesign', STYLE = ID + '-style', MARK = 'data-dsq-nav-replaced';
  const CREATE = ID + '-create', SHORTCUT = ID + '-create-shortcut', ANALYTICS = '#ds-qol-creator-analytics';
  let current = null, signature = '', landingChecked = false, analyticsAttempt = '';
  const path = () => DS.normalizedRoutePath?.() || location.pathname;
  const settings = () => DS.state?.settings || {};
  const pref = (key, fallback) => { try { return localStorage.getItem('dsq-nav-v1:' + key) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem('dsq-nav-v1:' + key, value); } catch {} };
  function remove() {
    for (const id of [ID, STYLE, CREATE, SHORTCUT]) document.getElementById(id)?.remove();
    document.querySelectorAll('[' + MARK + ']').forEach(x => x.removeAttribute(MARK));
    current = null; signature = '';
  }
  function nativeLink(nav, test) { return nav.querySelector(`[data-testid="${test}"]`)?.closest('a[href]') || null; }
  function valid(a) {
    if (!a?.href) return null;
    try { const u = new URL(a.href, location.href); return u.origin === location.origin && /^https?:$/.test(u.protocol) ? u.pathname + u.search + u.hash : null; } catch { return null; }
  }
  function link(label, url, click) {
    const a = document.createElement('a'); a.href = url; a.textContent = label; a.title = label;
    if (new URL(a.href).pathname === location.pathname && !a.hash) a.setAttribute('aria-current','page');
    if (click) a.addEventListener('click',click);
    return a;
  }
  function button(label, fn) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = fn; return b; }
  function group(label, key, children, s) {
    const d = document.createElement('details'); d.open = s.sidebarRememberMenus && pref(key,'0') === '1';
    const summary = document.createElement('summary'); summary.textContent = label; d.append(summary,...children);
    d.addEventListener('toggle',() => { if (settings().sidebarRememberMenus) save(key,d.open?'1':'0'); }); return d;
  }
  function localPath(p) { const m = location.pathname.match(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/|$)/i); return (m?.[0] || '') + p; }
  const findAction = (nav, id) => nav?.querySelector('#' + id) || document.querySelector(`[role="menu"] #${id}`);
  function visible(el) { return !!(el?.isConnected && el.getClientRects().length && !el.closest('[hidden],[aria-hidden="true"],.ds-hidden,[data-ds-hidden="1"]') && !el.disabled && el.getAttribute('aria-disabled') !== 'true'); }
  // The existing menu is deliberately kept available: do not invent an editor route or bypass a native entitlement check.
  async function nativeMenuAction(nav, menuTest, itemId, label) {
    const href = location.href;
    if (!visible(nav.querySelector(`[data-testid="${menuTest}"]`))) return;
    let target = findAction(nav,itemId);
    if (!visible(target)) nav.querySelector(`[data-testid="${menuTest}"]`)?.click();
    for (let i=0; i<6; i++) {
      if (href !== location.href || !settings().enabled || !settings().redesignedSidebarEnabled) return;
      target = findAction(nav,itemId);
      if (visible(target)) { target.click(); return; }
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    DS.setQuickStatus?.(`Choose ${label} in the native menu if available.`);
  }
  const createOptions = [
    ['Chatbot','hideSidebarCreateChatbot','navigation-button-create-character'],
    ['Lorebook','hideSidebarCreateLorebook','navigation-button-create-lorebook'],
    ['Rulebook','hideSidebarCreateRulebook','navigation-button-create-rulebook'],
    ['Group','hideSidebarCreateGroup','navigation-button-create-group'],
    ['Voice','hideSidebarCreateVoice','navigation-button-create-voice']
  ];
  const creationOptions = [
    ['Chatbots','hideSidebarMyChatbots','navigation-button-my-chatbots','/my-creations/chatbots'],
    ['Lorebooks','hideSidebarMyLorebooks','navigation-button-my-lorebooks','/my-creations/lorebooks'],
    ['Rulebooks','hideSidebarMyRulebooks','navigation-button-my-rulebooks',null],
    ['Groups','hideSidebarMyGroups','navigation-button-my-groups',null],
    ['Voices','hideSidebarMyVoices','navigation-button-my-voices',null]
  ];
  function createPage(nav,s) {
    if (document.getElementById(CREATE)) return;
    const dialog = document.createElement('dialog'); dialog.id=CREATE; dialog.dataset.dsOwned='1';
    dialog.style.cssText='max-width:min(620px,90vw);width:100%;color:#fff;background:#24262b;border:1px solid #777;border-radius:12px;padding:20px;max-height:85vh;overflow:auto';
    const h=document.createElement('h2');h.textContent='Create';dialog.append(h);
    const p=document.createElement('p');p.textContent='Choose a creation type. SpicyChat opens its own editor or account-specific creation menu.';dialog.append(p);
    for (const [label,hide,id] of createOptions) {
      if (s[hide]) continue;
      const b=button('Create '+label,()=>{dialog.close();void nativeMenuAction(nav,'Navigation-CreateMenuButton',id,label);});
      b.style.cssText='display:block;width:100%;text-align:left;padding:12px;margin:4px 0;border:1px solid #777;border-radius:7px';dialog.append(b);
    }
    const persona=nativeLink(nav,'Navigation-PersonasLink');
    if(!s.hideSidebarCreatePersona && valid(persona))dialog.append(link('Create Persona — open native Personas',valid(persona)));
    dialog.append(button('Close',()=>dialog.close()));dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
  }
  function analyticsControl() {
    if(path()!=='/my-creations/chatbots')return null;
    return [...document.querySelectorAll('#root main a,#root main button,#root [role="main"] a,#root [role="main"] button,#root a,#root button')].find(el=>!el.closest('nav,[data-ds-owned="1"]') && visible(el) && /^(creator analytics)$/i.test((el.textContent||el.getAttribute('aria-label')||'').trim()))||null;
  }
  function creationPageActions(s,nav) {
    if(path()!=='/my-creations/chatbots')return;
    const analytics=analyticsControl();
    if(location.hash===ANALYTICS && analytics && analyticsAttempt!==location.href && !s.hideSidebarCreatorAnalytics){analyticsAttempt=location.href;analytics.click();return;}
    if(!s.hideSidebarCreateChatbot && !document.getElementById(SHORTCUT)){
      const h=document.querySelector('main h1,#root h1');
      if(h){const b=button('Create chatbot',()=>void nativeMenuAction(nav,'Navigation-CreateMenuButton','navigation-button-create-character','Chatbot'));b.id=SHORTCUT;b.dataset.dsOwned='1';b.style.cssText='display:inline-block;padding:8px;border:1px solid currentColor;border-radius:6px';h.after(b);}
    }
  }
  DS.applyRedesignedSidebar=()=>{
    const s=settings();if(!s.enabled||!s.redesignedSidebarEnabled){if(current||document.getElementById(ID))remove();return;}
    const nav=document.querySelector('nav[data-testid="Navigation"]'),scroll=nav?.querySelector('[data-testid="NavigationScrollArea"]');
    if(!nav||!scroll){if(current)remove();return;}
    // Native collapsed/mobile icon rail is retained until expanded. Do not repeatedly build and discard DOM on a narrow rail.
    const specs=[['Navigation-ChatsLink','My Chats','hideSidebarChats'],['Navigation-HomeLink','Chats','hideSidebarHome'],['nav-discover','Discover feed','hideSidebarDiscover'],['nav-lorebooks','Lorebooks','hideSidebarDiscoverLorebooks'],['nav-rulebooks','Rulebooks','hideSidebarDiscoverRulebooks'],['Navigation-RecommendationsLink','Recommendations','hideSidebarRecommendations'],['Navigation-PersonasLink','Personas','hideSidebarPersonas']];
    const rows=specs.map(([test,label,hide])=>({test,label,hide,a:nativeLink(nav,test)}));
    const key=JSON.stringify([location.pathname,s.sidebarRememberMenus,s.sidebarCompactNavigation,s.sidebarDedicatedCreate,s.sidebarRememberCreationCategory,s.hideSidebarMyCreationsMenu,s.hideSidebarCreateMenu,s.hideSidebarCreatorAnalytics,...creationOptions.map(r=>!!s[r[1]]),...createOptions.map(r=>!!s[r[1]]),!!s.hideSidebarCreatePersona,...rows.map(r=>[valid(r.a),!!s[r.hide]])]);
    if(!landingChecked){landingChecked=true;const entry=performance.getEntriesByType?.('navigation')?.[0];if(path()==='/'&&entry?.type==='navigate'&&!document.referrer&&entry.name&&new URL(entry.name).pathname===location.pathname){const r=s.sidebarDefaultLanding==='chats'?rows[0]:s.sidebarDefaultLanding==='discover'?rows[2]:null;if(r&&!s[r.hide]&&valid(r.a)){location.replace(valid(r.a));return;}}}
    if(nav.getBoundingClientRect().width<115){if(current)remove();return;}
    if(current===nav&&signature===key&&document.getElementById(ID)&&rows.every(r=>!r.a||r.a.hasAttribute(MARK)||s[r.hide]||(r.test==='Navigation-PersonasLink'&&s.hideSidebarMyCreationsMenu))){creationPageActions(s,nav);return;}
    remove();current=nav;signature=key;
    const host=document.createElement('div');host.id=ID;host.dataset.dsOwned='1';host.dataset.compact=s.sidebarCompactNavigation?'1':'0';
    for(const r of rows)if(r.a&&s[r.hide])r.a.setAttribute(MARK,'1');
    const active=rows.filter(r=>r.a&&valid(r.a)&&!s[r.hide]);
    const make=r=>{r.a.setAttribute(MARK,'1');return link(r.label,valid(r.a),e=>{if(e.button===0&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&r.a.isConnected){e.preventDefault();r.a.click();}});};
    const chats=active.find(r=>r.test==='Navigation-ChatsLink');if(chats)host.append(make(chats));
    const discover=active.filter(r=>!['Navigation-ChatsLink','Navigation-PersonasLink'].includes(r.test));if(discover.length)host.append(group('Discover','discover',discover.map(make),s));
    if(!s.hideSidebarCreateMenu&&s.sidebarDedicatedCreate&&nav.querySelector('[data-testid="Navigation-CreateMenuButton"]'))host.append(button('Create',()=>createPage(nav,settings())));
    const persona=active.find(r=>r.test==='Navigation-PersonasLink');
    if(!s.hideSidebarMyCreationsMenu){
      const links=[];const native=nav.querySelector('[data-testid="Navigation-MyCreationsMenuButton"]');
      for(const [label,hide,id,url] of creationOptions){if(s[hide])continue;const remember=()=>{if(settings().sidebarRememberCreationCategory)save('category',label);};if(url)links.push(link(label,localPath(url),remember));else if(native)links.push(button(label,()=>{remember();void nativeMenuAction(nav,'Navigation-MyCreationsMenuButton',id,label);}));}
      if(persona){const a=make(persona);a.addEventListener('click',()=>{if(settings().sidebarRememberCreationCategory)save('category','Personas');});links.push(a);}
      if(links.length){const last=s.sidebarRememberCreationCategory?pref('category',''):'';host.append(group(last?'My Creations · '+last:'My Creations','creations',links,s));}
    }
    if(!s.hideSidebarCreatorAnalytics&&!s.hideSidebarMyChatbots)host.append(link('Creator Analytics',localPath('/my-creations/chatbots')+ANALYTICS));
    const style=document.createElement('style');style.id=STYLE;
    style.textContent=`nav[data-testid=Navigation] a[${MARK}]{display:none!important} #${ID}{display:grid;gap:3px;padding:4px 6px;min-width:0} #${ID} :is(a,button,summary){display:block;color:inherit;text-decoration:none;text-align:left;border:0;background:transparent;cursor:pointer;padding:8px 5px;border-radius:6px;font:inherit;overflow-wrap:anywhere} #${ID} details>a,#${ID} details>button{padding-left:12px} #${ID} a[aria-current=page],#${ID} :is(a,button,summary):hover{background:rgba(127,127,127,.18)} #${ID}[data-compact=1] :is(a,button,summary){padding-block:4px}`;
    document.head.append(style);scroll.prepend(host);creationPageActions(s,nav);
  };
  DS.removeRedesignedSidebar=remove;
})();
