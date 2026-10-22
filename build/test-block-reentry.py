from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
base=Path('/mnt/data')
soup=BeautifulSoup((base/'main spicychat with qol.html').read_text(),'lxml')
htmls=[]
ids=[]
for name in ['Quinlan','Sarah and Mark']:
    text=soup.find(string=lambda val: val and val.strip() == name)
    card=text.find_parent(attrs={'data-testid':'CharacterCard'})
    htmls.append(str(card.parent))
    ids.append(card.select_one('a[aria-label^="chat-with-"]')['href'].split('/chat/')[1].split('?')[0])
assert len(htmls)==2
html='<!doctype html><html><head><style>[data-testid=\"CharacterCard\"]{width:270px!important;height:350px!important}#grid>div{width:270px!important;height:350px!important;display:inline-block}</style></head><body><div id="grid">'+'\n'.join(htmls)+'</div></body></html>'
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-gpu'])
 page=browser.new_page()
 page.set_content(html)
 page.evaluate('''(ids) => {
 const DS=window.DragonScriptQoL = {
 state:{settings:{enabled:true,hiddenCardMode:'hide',replaceCardProfileWithBlockButton:true,neverHideFavorites:false},blockedBotIdSet:new Set(ids),runtimePerformance:{}},
 normalize:s=>String(s||'').toLowerCase(),
 qsa:(selector,root=document)=>[...root.querySelectorAll(selector)],
 botIdFromHref:href=>String(href||'').match(/\\/chatbot\\/([a-z0-9-]+)/i)?.[1]||'',
 chatIdFromHref:href=>String(href||'').match(/\\/chat\\/([a-z0-9-]+)/i)?.[1]||'',
 isSingleChatPage:()=>false,isBotProfilePage:()=>false,isChatListPage:()=>false,isFavoriteBotsPage:()=>false,
 isQolPausedForTab:()=>false,
 getCardFromChatLink:link=>link.closest('[data-testid="CharacterCard"]'),
 collectCards:()=>[...document.querySelectorAll('[data-testid="CharacterCard"]')].map(card=>({card,anchor:card.querySelector('a[aria-label^="chat-with-"]')})),
 getCardTitle:card=>card.querySelector('a[aria-label^="chat-with-"]')?.textContent,
 getCardImageUrl:card=>'',
 runtimeLog:()=>{},diagPerformance:()=>{},diagOperationEnd:()=>{},
 markQolOwned:(b,f)=>{b.dataset.dsFeature=f;b.dataset.dsOwner='qol';},
 findCardProfileButton:()=>null,
 getCurrentBotName:()=>'',
 }; window.DS=DS;
}''',ids)
 page.add_script_tag(path=str(base/'block-reentry-work/content/dom.js'))
 page.evaluate("""()=>{DS.chatIdFromHref=href=>String(href||'').match(/\\/chat\\/([a-z0-9-]+)/i)?.[1]||'';DS.botIdFromHref=href=>DS.chatIdFromHref(href)||String(href||'').match(/\\/chatbot\\/([a-z0-9-]+)/i)?.[1]||'';}""")
 page.add_script_tag(path=str(base/'block-reentry-work/content/cards.js'))
 page.add_script_tag(path=str(base/'block-reentry-work/content/bot-blocking.js'))
 # Native React insertion into a ds-* styled grid must not be mistaken for QoL-only.
 assert page.evaluate("""()=>{let grid=document.getElementById('grid');grid.classList.add('ds-grid-dense');let card=grid.querySelector('[data-testid=\"CharacterCard\"]');return DS.mutationIsQolOnly({type:'childList',target:grid,addedNodes:[card],removedNodes:[]});}""") is False
 assert page.evaluate("""()=>{let grid=document.getElementById('grid');let b=document.createElement('button');b.dataset.dsOwned='1';return DS.mutationIsQolOnly({type:'childList',target:grid,addedNodes:[b],removedNodes:[]});}""") is True
 first=page.locator('[data-testid="CharacterCard"]').nth(0)
 second=page.locator('[data-testid="CharacterCard"]').nth(1)
 # Blocked DOM mount from native
 out=page.evaluate('''()=>{let cards=[...document.querySelectorAll('[data-testid="CharacterCard"]')];return DS.hideBlockedCardMounts([{type:'childList',addedNodes:cards}]);}''')
 

 assert out==2,out
 assert first.locator('..').get_attribute('data-ds-hidden')=='1'
 assert second.locator('..').get_attribute('data-ds-hidden')=='1'
 # Existing safety watcher must also repair a native class change with no href/new nodes.
 page.evaluate('DS.ensureCardHideSafetyWatchdog()')
 page.evaluate("""()=>document.querySelector('[data-testid=\"CharacterCard\"]').parentElement.classList.remove('ds-hidden')""")
 page.wait_for_function("document.querySelector('[data-testid=\"CharacterCard\"]').parentElement.classList.contains('ds-hidden')",timeout=2000)
 # Native renderer removes the CSS but leaves our hidden state
 out=page.evaluate('''()=>{let parent=document.querySelector('[data-testid="CharacterCard"]').parentElement;parent.classList.remove('ds-hidden');return DS.hideBlockedCardMounts([{type:'attributes',attributeName:'class',target:parent}]);}''')
 assert out==1,out
 assert 'ds-hidden' in first.locator('..').get_attribute('class')
 # Native renderer removes both the class and the marker
 out=page.evaluate('''()=>{let card=document.querySelector('[data-testid="CharacterCard"]'),parent=card.parentElement;parent.classList.remove('ds-hidden');delete parent.dataset.dsHidden;return DS.hideBlockedCardMounts([{type:'attributes',attributeName:'class',target:card}]);}''')
 assert out==1,out
 assert first.locator('..').get_attribute('data-ds-hidden')=='1'
 # No writing/mutation if already hidden
 out=page.evaluate('''()=>DS.hideBlockedCardMounts([{type:'attributes',attributeName:'class',target:document.querySelector('[data-testid="CharacterCard"]')}])''')
 assert out==0,out
 # Existing X from a previous successful block is reconciled on card recycling
 page.evaluate('''()=>{let card=document.querySelector('[data-testid="CharacterCard"]');let btn=card.querySelector('button.ds-card-block-button');btn.disabled=true;btn.dataset.dsBlockBotId=DS.chatIdFromHref(card.querySelector('a[aria-label^="chat-with-"]').href);let a=card.querySelector('a[aria-label^="chat-with-"]');a.href='https://spicychat.ai/chat/00000000-0000-4000-8000-000000000005';}''')
 page.evaluate('DS.applyCardBlockButtons()')
 btn=page.locator('[data-testid="CharacterCard"]').first.locator('button.ds-card-block-button')
 assert not btn.is_disabled(),'recycled X still disabled'
 assert btn.get_attribute('data-ds-block-bot-id')=='00000000-0000-4000-8000-000000000005'
 # After a fresh native re-render, blocks are reapplied via href attributes
 second_card=second
 page.evaluate('''()=>{const parent=document.querySelectorAll('[data-testid="CharacterCard"]')[1].parentElement;parent.classList.remove('ds-hidden');delete parent.dataset.dsHidden;}''')
 assert page.evaluate('''()=>DS.hideBlockedCardMounts([{type:'attributes',attributeName:'href',target:document.querySelectorAll('[data-testid="CharacterCard"]')[1].querySelector('a[aria-label^="chat-with-"]')}])''') in (0,1)
 assert second_card.locator('..').get_attribute('data-ds-hidden')=='1'
 # Disabled X on a blocked card is not permission to show the card again.
 page.evaluate("""()=>{const card=document.querySelectorAll('[data-testid=\"CharacterCard\"]')[1];card.querySelector('button.ds-card-block-button').disabled=true;const wrapper=card.parentElement;wrapper.classList.remove('ds-hidden');delete wrapper.dataset.dsHidden;DS.applyCardBlockButtons();}""")
 assert second_card.locator('..').get_attribute('data-ds-hidden')=='1'
 # toggling off the extension never applies the hidden state
 page.evaluate('''()=>{DS.state.settings.enabled=false;const c=document.querySelectorAll('[data-testid="CharacterCard"]')[1].parentElement;c.classList.remove('ds-hidden');delete c.dataset.dsHidden;}''')
 assert page.evaluate('''()=>DS.hideBlockedCardMounts([{type:'attributes',attributeName:'class',target:document.querySelectorAll('[data-testid="CharacterCard"]')[1]}])''')==0
 assert not second_card.locator('..').get_attribute('data-ds-hidden')
 print('PASS: real Quinlan/Sarah-and-Mark markup; remount, class loss, marker loss, href reuse, disabled-X reuse, no-op, disabled QoL')
 browser.close()
