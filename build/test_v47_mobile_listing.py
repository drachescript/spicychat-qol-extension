from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
SCRIPT=ROOT/'content/mobile-listing-overflow.js'
HTML='''<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="app" style="width:100%"><main data-testid="SearchClientCharacterListing" style="display:flex; width:100%; padding: 4px; box-sizing:border-box; gap:18px;"><div class="flex h-full shrink-0 sticky z-10 mr-[18px]" style="flex-shrink:0;width:240px;"><div style="width:240px">Narrow by Features<label><input type="checkbox">Lorebook</label><label><input type="checkbox">Rulebook</label></div></div><div id="results" style="width:100%;min-width:300px"><h1>Results</h1><p>Card one</p></div></main></div></body></html>'''
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=b.new_page(viewport={'width':390,'height':780},device_scale_factor=2)
    page.set_content(HTML)
    before=page.evaluate('''() => ({mainLeft:document.querySelector('#results').getBoundingClientRect().left,scrollWidth:document.documentElement.scrollWidth,width:document.documentElement.clientWidth})''')
    assert before['scrollWidth']>before['width']
    page.add_script_tag(path=str(SCRIPT))
    page.wait_for_timeout(100)
    r=page.evaluate('''() => ({mainLeft:document.querySelector('#results').getBoundingClientRect().left,mainRight:document.querySelector('#results').getBoundingClientRect().right,scrollWidth:document.documentElement.scrollWidth,width:document.documentElement.clientWidth,button:document.getElementById('ds-mobile-listing-filters-button')?.textContent,hidden:getComputedStyle(document.querySelector('main').children[0]).display,filtersStillPresent:!!document.querySelector('input[type="checkbox"]')})''')
    print('mobile overflow',before,'->',r)
    assert r['button']=='Show filters' and r['hidden']=='none' and r['filtersStillPresent']
    assert r['mainRight']<=r['width']+2, r
    page.locator('#ds-mobile-listing-filters-button').click()
    x=page.evaluate('''() => ({button:document.getElementById('ds-mobile-listing-filters-button').textContent,sidebar:getComputedStyle(document.querySelector('main').children[0]).display,mainLeft:document.querySelector('#results').getBoundingClientRect().left})''')
    print('opened filter',x)
    assert x['sidebar']!='none' and x['button']=='Hide filters'
    page.locator('#ds-mobile-listing-filters-button').click()
    assert page.evaluate('''() => getComputedStyle(document.querySelector('main').children[0]).display''')=='none'
    # Disable behavior; it removes only QoL-owned changes.
    page.evaluate('''() => window.DragonScriptQoL={state:{settings:{enabled:false}}}''')
    page.wait_for_timeout(3200)
    assert page.locator('#ds-mobile-listing-filters-button').count()==0
    assert page.evaluate('''() => document.querySelector('main').hasAttribute('data-ds-mobile-listing-fix')''') is False
    # Normal mobile layout with a sidebar that is already hidden is untouched.
    page2=b.new_page(viewport={'width':390,'height':780})
    page2.set_content(HTML+'<style>@media(max-width:700px) { main > :first-child{display:none!important} #results{min-width:0!important} }</style>')
    page2.add_script_tag(path=str(SCRIPT))
    assert page2.locator('#ds-mobile-listing-filters-button').count()==0
    # Desktop remains completely untouched.
    d=b.new_page(viewport={'width':1240,'height':800})
    d.set_content(HTML)
    d.add_script_tag(path=str(SCRIPT))
    assert d.locator('#ds-mobile-listing-filters-button').count()==0
    b.close()
print('mobile listing overflow regression: PASS')
