// v0.2.57 opt-in, read-only Memory quality experiment; no page DOM scanner.
// Uses existing generation-metadata completion events. 2 normal successful
// exchanges, cooldown, no concurrent GETs, and no data transmitted to QoL logs.
if (!window.__DSQ_TAB_GATE__?.paused) (()=>{
  'use strict';
  const SOURCE='spicychat-qol-generation-metadata';
  const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  const validToken=t=>{
    if(typeof t!=='string'||t.length>12000||!JWT.test(t))return false;
    try{const segment=t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      const claims=JSON.parse(atob(segment.padEnd(Math.ceil(segment.length/4)*4,'=')));
      return Number(claims.exp||0)*1000>Date.now()+30000;
    }catch{return false;}
  };
  let enabled=false,route='',count=0,busy=false,lastCheck=0,blockedUntil=0,sequence=0;
  const updateSettings=data=>{enabled=data?.nativeMemoryQualityProbe===true && data?.enabled!==false;};
  const settingKey='dsSettingV1:nativeMemoryQualityProbe';
  chrome.storage.local.get(['settings','dsSettingV1:enabled',settingKey],r=>{
    updateSettings({...(r.settings||{}),enabled:r['dsSettingV1:enabled']??r.settings?.enabled,
      nativeMemoryQualityProbe:r[settingKey]??r.settings?.nativeMemoryQualityProbe});
  });
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local')return;
    if(changes[settingKey]){enabled=changes[settingKey].newValue===true;if(!enabled)++sequence;}
    if(changes['dsSettingV1:enabled']&&changes['dsSettingV1:enabled'].newValue===false){enabled=false;++sequence;}
  });
  const tokenFromStorage=store=>{
    try{for(let i=0;i<store.length;i++){
      const text=store.getItem(store.key(i))||'';
      if(text.length>1000000)continue;
      if(text.length<12000&&validToken(text))return text;
      if(text.startsWith('{')&&text.length<1000000){try{
        const obj=JSON.parse(text),list=[obj, obj?.stsTokenManager,obj?.stsTokenManager?.accessToken,obj?.accessToken,obj?.user,obj?.user?.stsTokenManager];
        for(const x of list){const t=typeof x==='string'?x:x?.accessToken||x?.idToken;if(validToken(t||''))return t;}
      }catch{}}
    }}catch{}return '';
  };
  async function getAuth(){
    let token=tokenFromStorage(localStorage)||tokenFromStorage(sessionStorage);
    if(token)return token;
    if(!indexedDB||typeof indexedDB.databases!=='function')return '';
    try{
      if(!(await indexedDB.databases()).some(db=>db.name==='firebaseLocalStorageDb'))return '';
      const db=await new Promise(resolve=>{const req=indexedDB.open('firebaseLocalStorageDb');req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);});
      if(!db)return '';
      try{
        if(!db.objectStoreNames.contains('firebaseLocalStorage'))return '';
        const rows=await new Promise(resolve=>{const r=db.transaction('firebaseLocalStorage','readonly').objectStore('firebaseLocalStorage').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>resolve([]);});
        for(const row of rows){const v=row?.value||row;token=v?.stsTokenManager?.accessToken||v?.accessToken||v?._tokenResponse?.idToken||'';if(validToken(token))return token;}
      }finally{db.close();}
    }catch{}
    return '';
  }
  function publish(result){
    // Only numeric counts and diagnostic status, never Memory text or IDs.
    const metadata={checkedAt:Date.now(),...result};
    window.DragonScriptQoL ||= {};
    window.DragonScriptQoL.nativeMemoryQualityLastResult=metadata;
    chrome.storage.local.set({'dsNativeMemoryProbeLastResultV1':metadata},()=>{void chrome.runtime.lastError;});
  }
  async function check(id){
    const signal=++sequence;busy=true;lastCheck=Date.now();
    try{
      const token=await getAuth();
      if(!enabled||signal!==sequence)return;
      if(!token){blockedUntil=Date.now()+60000;publish({ok:false,status:'auth-not-ready'});return;}
      const response=await new Promise(resolve=>chrome.runtime.sendMessage({
        type:'DS_NATIVE_MEMORY_PROBE',conversationId:id,authToken:token,
        appVersion:document.querySelector('meta[name="app-version"]')?.content||''
      },r=>resolve(chrome.runtime.lastError?{ok:false,status:'extension-error'}:r)));
      if(!enabled||signal!==sequence||route!==id)return;
      if(response?.status==='auth-rejected'||response?.status==='invalid-chat-or-auth')blockedUntil=Date.now()+300000;
      publish({
        checkedAt:Date.now(),ok:!!response?.ok,status:response?.status||'',
        baseline:!!response?.baseline,changed:!!response?.changed,
        count:Number(response?.count||0),added:Number(response?.added||0),
        removed:Number(response?.removed||0),updated:Number(response?.updated||0),
        quality:response?.quality||null
      });
    }catch{publish({ok:false,status:'unexpected-error'});}
    finally{busy=false;}
  }
  window.addEventListener('message',event=>{
    if(!enabled||Date.now()<blockedUntil||event.source!==window||event.origin!==location.origin||
       event.data?.source!==SOURCE||event.data?.type!=='DSQ_NEW_GENERATION')return;
    const m=event.data.payload||{};
    if(m.continued||m.alternativeMessageId||m.isAlternative)return;
    const path=location.pathname.match(/^\/chat\/([0-9a-f-]{36})\/([0-9a-f-]{36})(?:\/|$)/i);
    if(!path||!UUID.test(m.conversationId||''))return;
    const id=path[2].toLowerCase();if(id!==String(m.conversationId).toLowerCase())return;
    if(route!==id){route=id;count=0;lastCheck=0;blockedUntil=0;++sequence;}
    count++;
    if(count<2||busy||Date.now()-lastCheck<60000)return;
    count=0;void check(id).catch(()=>{});
  });
})();
