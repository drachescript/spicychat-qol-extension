// Local navigation presentation. Native links/actions and account gates remain authoritative.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  'use strict';
  const DS=window.DragonScriptQoL;if(!DS)return;
  const ID='ds-qol-navigation-redesign', STYLE=ID+'-style', MARK='data-dsq-nav-replaced', CREATE=ID+'-create', SHORTCUT=ID+'-create-shortcut', TABS=ID+'-creation-tabs';
  const ANALYTICS='#ds-qol-creator-analytics', PERSONA='#ds-qol-create-persona';
  const orderKeys='chats,discover,browse,feed,recommendations,lorebooks,rulebooks,create,creations,chatbots,myLorebooks,myRulebooks,groups,voices,personas,favorites,later,analytics,leaderboard,blocked,gallery,subscribe'.split(',');
  let current=null,signature='',landingChecked=false,actionSerial=0,activeAction=false,hashAttempt='',nativeRows=[];
  const path=()=>DS.normalizedRoutePath?.()||location.pathname;
  const settings=()=>DS.state?.settings||{};
  const enabled=()=>settings().enabled&&settings().redesignedSidebarEnabled;
  const pref=(k,d)=>{try{return localStorage.getItem('dsq-nav-v1:'+k)??d;}catch{return d;}};
  const save=(k,v)=>{try{localStorage.setItem('dsq-nav-v1:'+k,v);}catch{}};
  function remove(){actionSerial++;activeAction=false;for(const id of [ID,STYLE,CREATE,SHORTCUT,TABS])document.getElementById(id)?.remove();for(const el of nativeRows)el.removeAttribute(MARK);nativeRows=[];current=null;signature='';}
  const mark=el=>{if(el){if(!el.hasAttribute(MARK))el.setAttribute(MARK,'1');if(!nativeRows.includes(el))nativeRows.push(el);}};
  function nativeLink(nav,test){return nav.querySelector(`[data-testid="${test}"]`)?.closest('a[href]')||null;}
  function valid(a){if(!a?.href)return null;try{const u=new URL(a.href,location.href);return u.origin===location.origin&&/^https?:$/.test(u.protocol)?u.pathname+u.search+u.hash:null;}catch{return null;}}
  function localPath(p){return (location.pathname.match(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/|$)/i)?.[0]||'')+p;}
  const ordinary=e=>e.button===0&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey;
  function link(label,url,click){const a=document.createElement('a');a.href=url;a.textContent=label;a.title=label;if(new URL(a.href).pathname===location.pathname&&a.hash===location.hash)a.setAttribute('aria-current','page');if(click)a.addEventListener('click',click);return a;}
  function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;return b;}
  function group(label,key,children,s){const d=document.createElement('details');d.open=s.sidebarRememberMenus&&pref(key,'0')==='1';if(children.some(x=>x.matches('[aria-current=page]')||x.querySelector('[aria-current=page]')))d.open=true;const sum=document.createElement('summary');sum.textContent=label;d.append(sum,...children);d.addEventListener('toggle',()=>{if(settings().sidebarRememberMenus)save(key,d.open?'1':'0');});return d;}
  const findAction=(nav,id)=>nav.querySelector('#'+id)||document.querySelector(`[role="menu"] #${id}`)||document.getElementById(id);
  function visible(el){return !!(el?.isConnected&&el.getClientRects().length&&!el.closest('[hidden],[aria-hidden="true"],.ds-hidden,[data-ds-hidden="1"]')&&!el.disabled&&el.getAttribute('aria-disabled')!=='true');}
  function trigger(nav,test){return nav.querySelector(`[data-testid="${test}"]`);}
  function triggerRow(b){return b?.closest('[data-tooltip-content]')?.parentElement||b;}
  async function nativeMenuAction(nav,menuTest,itemId,label){
    if(activeAction||!enabled())return;
    const b=trigger(nav,menuTest),row=triggerRow(b);if(!b)return;
    const token=++actionSerial,href=location.href;activeAction=true;const marked=row?.hasAttribute(MARK);row?.removeAttribute(MARK);let done=false;
    try{if(!visible(b))return;let target=findAction(nav,itemId);if(!visible(target))b.click();for(let i=0;i<8;i++){if(token!==actionSerial||href!==location.href||!enabled())return;target=findAction(nav,itemId);if(visible(target)){target.click();done=true;return;}await new Promise(r=>setTimeout(r,90));}DS.setQuickStatus?.(`Choose ${label} in the native menu if available.`);}
    finally{if(token===actionSerial){activeAction=false;if(marked&&(done||settings()[menuTest==='Navigation-CreateMenuButton'?'hideSidebarCreateMenu':'hideSidebarMyCreationsMenu'])&&row?.isConnected)mark(row);else if(marked){/* Keep native fallback visible until next navigation/settings change. */}}}
  }
  const createOptions=[['Chatbot','hideSidebarCreateChatbot','navigation-button-create-character'],['Lorebook','hideSidebarCreateLorebook','navigation-button-create-lorebook'],['Rulebook','hideSidebarCreateRulebook','navigation-button-create-rulebook'],['Group','hideSidebarCreateGroup','navigation-button-create-group'],['Voice','hideSidebarCreateVoice','navigation-button-create-voice']];
  const creationOptions=[['chatbots','Chatbots','hideSidebarMyChatbots','navigation-button-my-chatbots','/my-creations/chatbots'],['myLorebooks','Lorebooks','hideSidebarMyLorebooks','navigation-button-my-lorebooks','/my-creations/lorebooks'],['myRulebooks','Rulebooks','hideSidebarMyRulebooks','navigation-button-my-rulebooks',null],['groups','Groups','hideSidebarMyGroups','navigation-button-my-groups',null],['voices','Voices','hideSidebarMyVoices','navigation-button-my-voices',null]];
  function createPage(nav,s){
    if(document.getElementById(CREATE))return;const dialog=document.createElement('dialog');dialog.id=CREATE;dialog.dataset.dsOwned='1';dialog.setAttribute('aria-label','Create');
    const h=document.createElement('h2');h.textContent='Create';const p=document.createElement('p');p.textContent='Choose what to create. Each option opens SpicyChat’s native creation workflow.';dialog.append(h,p);const grid=document.createElement('div');grid.className='dsq-create-grid';dialog.append(grid);
    const descriptions=['Build a character to chat with.','Add world information and keyword-triggered entries.','Define rules and behavior.','Create a group of characters.','Create a custom voice.'];
    createOptions.forEach(([label,hide,id],i)=>{if(s[hide])return;const b=button('Create '+label,()=>{dialog.close();void nativeMenuAction(nav,'Navigation-CreateMenuButton',id,label);});const small=document.createElement('small');small.textContent=descriptions[i];b.append(small);grid.append(b);});
    const persona=nativeLink(nav,'Navigation-PersonasLink');if(!s.hideSidebarCreatePersona&&valid(persona)){const a=link('Create Persona',valid(persona).split('#')[0]+PERSONA);const small=document.createElement('small');small.textContent='Open the native Persona creation flow.';a.append(small);grid.append(a);}
    dialog.append(button('Back',()=>dialog.close()));dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  }
  function pageControl(re,includeMarked=false){const scope=document.querySelector('#root main,#root [role="main"]')||document.querySelector('#root');return [...(scope?.querySelectorAll('a,button')||[])].find(el=>!el.closest('nav,[data-ds-owned="1"],dialog,[role="dialog"]')&&(visible(el)||(includeMarked&&el.hasAttribute(MARK)))&&re.test((el.textContent||el.getAttribute('aria-label')||'').trim()))||null;}
  function pageCategory(){const p=path();if(/^\/personas\/?$/.test(p))return 'Persona';const m=p.match(/^\/my-creations\/(chatbots|lorebooks|rulebooks|groups|voices)\/?$/);return m?({chatbots:'Chatbot',lorebooks:'Lorebook',rulebooks:'Rulebook',groups:'Group',voices:'Voice'})[m[1]]:null;}
  function creationPageActions(s,nav){
    const category=pageCategory(),old=document.getElementById(SHORTCUT),oldTabs=document.getElementById(TABS);if(!category){old?.remove();oldTabs?.remove();return;}
    const analytics=category==='Chatbot'?pageControl(/^creator analytics$/i,true):null;
    if(location.hash===ANALYTICS&&analytics&&hashAttempt!==location.href&&s.sidebarAnalyticsShortcut!==false&&!s.hideSidebarCreatorAnalytics){hashAttempt=location.href;analytics.removeAttribute(MARK);if(visible(analytics)){try{history.replaceState(history.state,'',location.pathname+location.search);}catch{}analytics.click();}return;}
    const native=pageControl(new RegExp('^(?:\\+\\s*)?(?:create|add|new)\\s+(?:a\\s+)?'+category+'(?:s)?$','i'));
    if(category==='Persona'&&location.hash===PERSONA&&native&&hashAttempt!==location.href&&!s.hideSidebarCreatePersona){hashAttempt=location.href;try{history.replaceState(history.state,'',location.pathname+location.search);}catch{}native.click();return;}
    const spec=createOptions.find(x=>x[0]===category),h=document.querySelector('main h1,#root h1,main h2,#root h2');
    if(s.sidebarCreationButtons===false||!spec||s[spec[1]]||native||!trigger(nav,'Navigation-CreateMenuButton'))old?.remove();
    else if(!old&& (analytics||h)){const b=button('Create '+category.toLowerCase(),()=>void nativeMenuAction(nav,'Navigation-CreateMenuButton',spec[2],category));b.id=SHORTCUT;b.dataset.dsOwned='1';(analytics||h).after(b);}
    // Only replace the actual analytics control when both the shortcut and a usable Create button exist.
    if(analytics){if(s.sidebarAnalyticsShortcut!==false&&!s.hideSidebarCreatorAnalytics&&!s.hideSidebarMyChatbots&&trigger(nav,'Navigation-MyCreationsMenuButton')&&(native||document.getElementById(SHORTCUT))&&location.hash!==ANALYTICS)mark(analytics);else analytics.removeAttribute(MARK);}
    // Native category navigation, not a fabricated merged list. No extra data fetch.
    if(s.sidebarCreationTabs!==false&&['Chatbot','Group'].includes(category)&&h&&!oldTabs&&!s.hideSidebarMyChatbots&&!s.hideSidebarMyGroups){const bar=document.createElement('div');bar.id=TABS;bar.dataset.dsOwned='1';bar.append(link('Chatbots',localPath('/my-creations/chatbots')),button('Groups',()=>void nativeMenuAction(nav,'Navigation-MyCreationsMenuButton','navigation-button-my-groups','Groups')));h.after(bar);}else if(s.sidebarCreationTabs===false||!['Chatbot','Group'].includes(category)||s.hideSidebarMyChatbots||s.hideSidebarMyGroups)oldTabs?.remove();
  }
  const specs=[['chats','Navigation-ChatsLink','My Chats','hideSidebarChats'],['browse','Navigation-HomeLink','Chats','hideSidebarHome'],['feed','nav-discover','Discover feed','hideSidebarDiscover'],['lorebooks','nav-lorebooks','Lorebooks','hideSidebarDiscoverLorebooks'],['rulebooks','nav-rulebooks','Rulebooks','hideSidebarDiscoverRulebooks'],['recommendations','Navigation-RecommendationsLink','Recommendations','hideSidebarRecommendations'],['personas','Navigation-PersonasLink','Personas','hideSidebarPersonas'],['favorites','Navigation-FavoritesLink','Favorites','hideSidebarFavorites'],['leaderboard','Navigation-LeaderboardLink','Leaderboard','hideSidebarLeaderboard'],['blocked','Navigation-BlockedCreatorsLink','Blocked Creators','hideSidebarBlockedCreators'],['gallery','nav-my-gallery','Gallery',null],['subscribe','Navigation-SubscribeLink','Subscribe','hideSidebarSubscribe']];
  DS.applyRedesignedSidebar=()=>{
    const s=settings();if(!enabled()){if(current||document.getElementById(ID))remove();return;}
    const nav=document.querySelector('nav[data-testid="Navigation"]'),scroll=nav?.querySelector('[data-testid="NavigationScrollArea"]');if(!nav||!scroll){if(current)remove();return;}
    const rows=specs.map(([key,test,label,hide])=>({key,test,label,hide,a:nativeLink(nav,test)}));const later=nav.querySelector('#ds-qol-sidebar-later');if(later&&s.showLaterFavoritesTab)rows.push({key:'later',label:'Later',hide:'hideSidebarFavorites',a:later});
    if(!landingChecked){landingChecked=true;const entry=performance.getEntriesByType?.('navigation')?.[0];if(path()==='/'&&entry?.type==='navigate'&&!document.referrer&&entry.name&&new URL(entry.name).pathname===location.pathname){const r=rows.find(x=>x.key===(s.sidebarDefaultLanding==='chats'?'chats':s.sidebarDefaultLanding==='discover'?'feed':''));if(r&&!s[r.hide]&&valid(r.a)){location.replace(valid(r.a));return;}}}
    if(nav.getBoundingClientRect().width<115){if(current)remove();return;}
    if(activeAction&&current===nav)return;
    const key=JSON.stringify([location.pathname,location.hash,...Object.keys(s).filter(k=>k.startsWith('sidebar')||k.startsWith('hideSidebar')).sort().map(k=>[k,s[k]]),...rows.map(r=>[valid(r.a),!!s[r.hide]]),!!trigger(nav,'Navigation-CreateMenuButton'),!!trigger(nav,'Navigation-MyCreationsMenuButton')]);
    if(current===nav&&signature===key&&document.getElementById(ID)&&nativeRows.every(el=>el.isConnected)){creationPageActions(s,nav);return;}
    remove();current=nav;signature=key;
    const order=[...new Set(String(s.sidebarOrder||'').split(',').filter(k=>orderKeys.includes(k)).concat(orderKeys))];const sorted=items=>items.sort((a,b)=>order.indexOf(a[0])-order.indexOf(b[0]));
    const host=document.createElement('div');host.id=ID;host.dataset.dsOwned='1';host.dataset.compact=s.sidebarCompactNavigation?'1':'0';
    const active=rows.filter(r=>valid(r.a)&&!s[r.hide]);const get=k=>active.find(r=>r.key===k);const items=[];
    const make=(r,label=r.label)=>{mark(r.a);const a=link(label,valid(r.a),e=>{if(ordinary(e)&&r.a.isConnected){e.preventDefault();r.a.click();}});a.id=ID+"-link-"+r.key;return a;};
    const add=(k,label)=>{const r=get(k);if(r)items.push([k,make(r,label||r.label)]);};
    add('chats',s.sidebarRenameChats===false?'Chats':'My Chats');const discovery=['browse','feed','recommendations','lorebooks','rulebooks'];if(s.sidebarGroupDiscover!==false){const children=sorted(discovery.map(k=>get(k)).filter(Boolean).map(r=>[r.key,make(r)]));if(children.length)items.push(['discover',group('Discover','discover',children.map(x=>x[1]),s)]);}else for(const k of discovery)add(k,k==='browse'?'Home':k==='feed'?'Discover':undefined);
    const createTrigger=trigger(nav,'Navigation-CreateMenuButton');if(s.hideSidebarCreateMenu&&createTrigger)mark(triggerRow(createTrigger));if(!s.hideSidebarCreateMenu&&s.sidebarDedicatedCreate&&createTrigger){items.push(['create',button('Create',()=>createPage(nav,settings()))]);mark(triggerRow(createTrigger));}
    const myTrigger=trigger(nav,'Navigation-MyCreationsMenuButton'),persona=get('personas');if(s.hideSidebarMyCreationsMenu&&myTrigger)mark(triggerRow(myTrigger));
    if(!s.hideSidebarMyCreationsMenu&&myTrigger){const children=[];for(const [k,label,hide,id,url] of creationOptions){if(s[hide])continue;const remember=()=>{if(settings().sidebarRememberCreationCategory)save('category',label);};const el=url?link(label,localPath(url),remember):button(label,()=>{remember();void nativeMenuAction(nav,'Navigation-MyCreationsMenuButton',id,label);});children.push([k,el]);}if(persona&&s.sidebarGroupPersonas!==false){const a=make(persona);a.addEventListener('click',()=>{if(settings().sidebarRememberCreationCategory)save('category','Personas');});children.push(['personas',a]);}if(children.length){const last=s.sidebarRememberCreationCategory?pref('category',''):'';items.push(['creations',group(last?'My Creations · '+last:'My Creations','creations',sorted(children).map(x=>x[1]),s)]);mark(triggerRow(myTrigger));}}
    if(persona&&!persona.a.hasAttribute(MARK))add('personas','My Personas');
    for(const k of ['favorites','later','leaderboard','blocked','gallery','subscribe'])add(k);
    if(s.sidebarAnalyticsShortcut!==false&&!s.hideSidebarCreatorAnalytics&&!s.hideSidebarMyChatbots&&myTrigger)items.push(['analytics',link('Creator Analytics',localPath('/my-creations/chatbots')+ANALYTICS,e=>{if(!ordinary(e)||pageCategory()!=='Chatbot')return;const action=pageControl(/^creator analytics$/i,true);if(!action)return;e.preventDefault();action.removeAttribute(MARK);if(visible(action))action.click();})]);
    // Unmodified external Help, footer, sign-in, and third-party controls remain native.
    host.append(...sorted(items).map(x=>x[1]));
    const style=document.createElement('style');style.id=STYLE;style.textContent=`[${MARK}]{display:none!important} #${ID}{display:grid;gap:3px;padding:4px 6px;min-width:0} #${ID} :is(a,button,summary){display:block;color:inherit;text-decoration:none;text-align:left;border:0;background:transparent;cursor:pointer;padding:8px 5px;border-radius:6px;font:inherit;overflow-wrap:anywhere} #${ID} details>a,#${ID} details>button{padding-left:12px} #${ID} a[aria-current=page],#${ID} :is(a,button,summary):hover{background:rgba(127,127,127,.18)} #${ID}[data-compact=1] :is(a,button,summary){padding-block:4px} #${CREATE}{width:min(760px,94vw);max-width:94vw;max-height:90vh;overflow:auto;background:Canvas;color:CanvasText;border:1px solid #888;border-radius:12px;padding:20px} #${CREATE}::backdrop{background:#0008} #${CREATE} .dsq-create-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:10px;margin:16px 0} #${CREATE} :is(a,button),#${SHORTCUT},#${TABS} :is(a,button){display:inline-block;text-align:left;color:inherit;border:1px solid #888;border-radius:8px;padding:10px;background:transparent;text-decoration:none;cursor:pointer} #${CREATE} small{display:block;opacity:.75;margin-top:5px} #${TABS}{display:flex;gap:8px;flex-wrap:wrap;margin-block:8px}`;
    document.head.append(style);scroll.prepend(host);creationPageActions(s,nav);
  };
  DS.removeRedesignedSidebar=remove;
})();
