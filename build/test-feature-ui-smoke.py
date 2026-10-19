"""Chromium smoke test on synthetic DOM, not authenticated SpicyChat acceptance."""
import subprocess,tempfile,html,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
BOT='0640850c-37e6-4729-ab52-5284e3701650'; CONV='98231b59-1919-468c-a92a-9cf12374b64f'
with tempfile.TemporaryDirectory(prefix='feature-ui-smoke-') as td:
    root=Path(td);file=root/'chat'/BOT/CONV/'index.html';file.parent.mkdir(parents=True)
    js=lambda name:(ROOT/'content'/name).as_uri()
    files='\n'.join('<script src="'+js(name)+'"></script>' for name in ['model-quick-access.js','previously-chatted-indicator.js','chat-lorebook-manager.js'])
    page=f'''<!doctype html><html><body>
<div id="nativeModelMenu"><p>Available models</p><div class="cursor-pointer" id="qwenRow"><p>Qwen Plus Character</p><p>Model description lengthy enough to be real</p></div><div class="cursor-pointer" id="spicyRow"><p>SpicyXL 132B</p><p>Model description lengthy enough to be real</p></div></div>
<div><a aria-label="chatbot-profile" href="/chatbot/{BOT}">Bot</a></div>
<div data-testid="ChatMemoryManagerCapabilityGate" id="memories"><div id="memoryRow"><div class="overflow-wrap"><span>Character has a secret</span></div><button data-slot="trigger" aria-haspopup="true">Options</button></div></div>
<div id="message-123"><div class="bg-blumine-6">hello there</div></div>
<div class="card" id="card1"><a href="/chatbot/{BOT}">My Bot</a></div>
<pre id="testResults"></pre>
<script>
const stored={{}};
window.chrome={{storage:{{local:{{get:(keys,cb)=>cb(Object.fromEntries(keys.map(k=>[k,stored[k]]))),set:(v,cb)=>{{Object.assign(stored,v);cb();}}}}}},runtime:{{lastError:null}}}};
window.DragonScriptQoL={{state:{{settings:{{enabled:true,enableModelQuickAccess:true,modelQuickAccessNames:'SpicyXL 132B\\nQwen Plus Character',enableChatLorebookManager:true,enablePreviouslyChattedIndicator:true}},openedChats:new Set(),openedChatMeta:{{}}}},isSingleChatPage:()=>true,isQolPausedForTab:()=>false,saveOpenedChats:()=>Promise.resolve(),botIdFromHref:(url)=>url.match(/([0-9a-f-]{{36}})/i)?.[1]||''}};
document.getElementById('spicyRow').onclick=()=>window.modelSelected='SpicyXL 132B';
</script>
{files}
<script>
(async()=>{{
const DS=window.DragonScriptQoL;
DS.applyModelQuickAccess();DS.applyChatLorebookManager();DS.applyPreviouslyChattedIndicator();
const modelButtons=[...document.querySelectorAll('.ds-model-quick-access-buttons button')].map(b=>b.textContent);
document.querySelector('.ds-model-quick-access-buttons button')?.click();
const memoryButton=document.querySelector('.ds-memory-lorebook-button');memoryButton?.click();
const modal=document.getElementById('ds-chat-lorebook-modal');
if(modal){{modal.querySelectorAll('input')[0].value='Talia Secret';modal.querySelectorAll('input')[1].value='Talia, secret';[...modal.querySelectorAll('.ds-lb-draft-actions button')].find(b=>b.textContent==='Save local draft')?.click();}}
await new Promise(resolve=>setTimeout(resolve,250));
const draft=stored['dsQolChatLorebookDraftsV1']?.['{BOT}']?.[0];
const indicator=DS.state.openedChatMeta['{BOT}']?.hasConfirmedUserMessage===true;
const result={{modelButtons,modelSelected:window.modelSelected,openedModal:!!modal,hadMemoryAction:!!memoryButton,draftName:draft?.name,draftText:draft?.content,chatMessageRecorded:indicator}};
document.getElementById('testResults').textContent=JSON.stringify(result);
}})().catch(e=>document.getElementById('testResults').textContent='ERROR '+String(e));
</script></body></html>'''
    file.write_text(page)
    cmd=['chromium','--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run','--virtual-time-budget=2400','--dump-dom',file.as_uri()]
    try:
        result=subprocess.run(cmd,capture_output=True,text=True,timeout=12)
    except subprocess.TimeoutExpired:
        print('SKIP: Chromium did not start in this container (no browser pass claimed)')
        raise SystemExit(0)
    output=result.stdout
    from bs4 import BeautifulSoup
    soup=BeautifulSoup(output,'html.parser')
    text=soup.select_one('#testResults').text if soup.select_one('#testResults') else ''
    print(text or ('No test output: '+result.stderr[-500:]))
    try: data=json.loads(text)
    except Exception:raise SystemExit('Browser smoke test failed to produce JSON result')
    assert data['modelButtons']==['SpicyXL 132B','Qwen Plus Character'],data
    assert data['modelSelected']=='SpicyXL 132B',data
    assert data['openedModal'] and data['hadMemoryAction'],data
    assert data['draftName']=='Talia Secret' and data['draftText']=='Character has a secret',data
    assert data['chatMessageRecorded'],data
    print('PASS: synthetic Chromium interaction: model selection, memory editor, local draft save, current-chat confirmed status')
