"""Offline Chromium smoke checks, no requests to SpicyChat."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page()
    page.set_content('''<main><div data-testid="BotListToolbarV2-Dropdowns"></div><div class="flex gap-md justify-between"><input data-testid="BotListToolbarV2-SearchInput"></div><div class="cards"><div id="b1"><span data-testid="RulebookBadge">Rulebook</span></div><div id="b2"><span data-rulebook-count="0">None</span></div><div id="b3">Missing badge, status unknown</div></div></main>''')
    page.add_style_tag(content=(ROOT/'content/styles/rulebook-filter.css').read_text())
    page.evaluate('''() => {
      const ids=['b1','b2','b3'];
      window.DragonScriptQoL={state:{settings:{enabled:true,showRulebookFilters:true}},
        isMyCreationsChatbotsPage:()=>true,collectCards:()=>ids.map(id=>({card:document.getElementById(id)})),
        getBestHideTarget: card=>card};
    }''')
    page.add_script_tag(content=(ROOT/'content/rulebook-filter.js').read_text())
    result=page.evaluate('''() => { const d=DragonScriptQoL;
      d.applyRulebookListingTools();
      const state=['b1','b2','b3'].map(id=>d.cardRulebookState(document.getElementById(id)));
      const sel=document.querySelector('#ds-rulebook-filter-mode');sel.value='none';sel.dispatchEvent(new Event('change'));
      const hide=['b1','b2','b3'].map(id=>getComputedStyle(document.getElementById(id)).display==='none');
      d.state.settings.showRulebookFilters=false;d.applyRulebookListingTools();
      return {state,hide,cleanup:!document.getElementById('ds-rulebook-filter-toolbar')&&['b1','b2','b3'].every(id=>getComputedStyle(document.getElementById(id)).display!=='none')};
    }''')
    print('FILTER',result)
    assert result=={'state':['has','none','unknown'],'hide':[True,False,True],'cleanup':True}
    page.set_content('''<div data-testid="RulebookMeterPanel"><div data-testid="RulebookMeterPanel-Meter-m1" aria-label="Brenric’s Trust: 10"><span data-testid="RulebookMeterPanel-Value-m1">10</span></div><div data-testid="RulebookMeterPanel-Meter-m4" aria-label="Political Tension: 65"><span data-testid="RulebookMeterPanel-Value-m4">65</span></div></div><div data-testid="RulebookExplanationSheet-RulebookLine">Rulebook: Copy of The Kingdom of Veyrholt v1 by @qol_extension_test.</div>''')
    page.evaluate('''() => {window.DragonScriptQoL={};}''')
    page.add_script_tag(content=(ROOT/'content/chat-rulebook-metadata.js').read_text())
    snap=page.evaluate('DragonScriptQoL.snapshotVisibleRulebook()');print('EXPORT_SNAPSHOT',snap)
    assert snap['meters'][0]['value']==10 and snap['meters'][1]['value']==65
    assert snap['name']=='Copy of The Kingdom of Veyrholt'
    page.set_content('''<main></main><label class="row"><input type="checkbox" id="showRulebookFilters" checked></label><label class="row"><input type="checkbox" id="chatExportIncludeRulebook" checked></label><label class="row"><input type="checkbox" id="showOocTools" checked></label>''')
    page.add_style_tag(content=(ROOT/'options.css').read_text())
    page.evaluate('''() => {window.__DSQ_BUILD_PROFILE__={generated:true,bundles:['core','interface','chat']};window.SpicyChatQoLFeatureRegistry=[{setting:'showRulebookFilters',bundle:'creator'}];}''')
    page.add_script_tag(content=(ROOT/'settings/options-feature-availability.js').read_text())
    ui=page.evaluate('''() => ({filterHidden:getComputedStyle(document.querySelector('#showRulebookFilters').parentElement).display==='none',
      checked:document.querySelector('#showRulebookFilters').checked,
      exportVisible:getComputedStyle(document.querySelector('#chatExportIncludeRulebook').parentElement).display!=='none',
      notice:document.querySelector('#ds-lite-settings-notice')?.textContent})''')
    print('LITE_SETTINGS',ui)
    assert ui['filterHidden'] and ui['checked'] and ui['exportVisible']
    browser.close()
print('Browser checks: PASS')
