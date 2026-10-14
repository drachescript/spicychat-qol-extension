from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2)
 page.set_content('''<main data-testid="SearchClientCharacterListing"><div class="p-2.5"><input placeholder="Search tags"></div><div id="native"><button><span>Narrow by Features</span></button><label><input type="checkbox">Lorebook <span>Has world info / lore</span></label><label><input type="checkbox">Rulebook</label><label><input type="checkbox">Custom Voice</label></div><div id="card1"><a href="/chat/one">Bot 1</a><span aria-label="lorebook">Badge</span></div><div id="card2"><a href="/chat/two">Bot 2</a></div></main>''')
 page.evaluate('''() => { window.DragonScriptQoL={state:{settings:{enabled:true,showLorebookFilters:true}},collectCards:()=>Array.from(document.querySelectorAll('[id^="card"]')).map(card=>({card})),getBestHideTarget:card=>card}; }''')
 page.add_script_tag(content=(ROOT/'content/lorebook-search-filter.js').read_text())
 r=page.evaluate('''() => { DragonScriptQoL.applyLorebookSearchFilter(); return {native:!!document.getElementById('native'),duplicate:!!document.getElementById('ds-lorebook-search-filter'),hidden:document.querySelectorAll('.ds-lorebook-search-filter-hidden').length};}''')
 print('Native Filter',r);assert r['native'] and not r['duplicate'] and not r['hidden']
 page.evaluate('''() => {document.querySelector('#native').remove(); DragonScriptQoL.applyLorebookSearchFilter();}''')
 r=page.evaluate('!!document.getElementById("ds-lorebook-search-filter")');print('Local fallback',r);assert r
 page.set_content('<div id="root"></div>')
 page.evaluate('''() => {window.DragonScriptQoL={state:{settings:{enabled:true,enableBotOrganizer:true}}}}''')
 page.add_script_tag(content=(ROOT/'content/mobile-bot-organizer.js').read_text())
 page.evaluate('''() => { const t=document.createElement('div');t.id='ds-bot-organizer-toolbar';t.className='ds-bot-organizer-toolbar';t.innerHTML='<input type="search" placeholder="Search local notes/tags"><button type="button">More</button>';document.body.appendChild(t); }''')
 page.wait_for_timeout(80)
 before=page.evaluate('''() => ({collapsed:document.querySelector('#ds-bot-organizer-toolbar').dataset.dsMobileCollapsed,launcher:document.querySelector('#ds-bot-org-mobile-toggle')?.textContent,hidden:getComputedStyle(document.querySelector('#ds-bot-organizer-toolbar input')).display})''')
 print('Mobile closed',before);assert before['collapsed']=='1' and before['hidden']=='none'
 page.get_by_text('Organize bots').click()
 after=page.evaluate('''() => ({collapsed:document.querySelector('#ds-bot-organizer-toolbar').dataset.dsMobileCollapsed,launcher:document.querySelector('#ds-bot-org-mobile-toggle')?.textContent})''')
 print('Mobile open',after);assert after['collapsed']=='0'
 # simulate organizer rebuilding controls
 page.evaluate('''() => {document.querySelector('#ds-bot-organizer-toolbar').replaceChildren(document.createElement('input'))}''')
 page.wait_for_timeout(80)
 assert page.locator('#ds-bot-org-mobile-toggle').count()==1
 b.close()
print('Native + Mobile browser tests: PASS')
