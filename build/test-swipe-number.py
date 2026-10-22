"""Offline swipe-number navigation regression tests.
Run: python build/test-swipe-number.py (requires Playwright and Chromium).
Native button/counter layout models the SpicyChat 4.7.x chat editor.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / 'content/scroll-to-top.js').read_text().replace('location.pathname', '"/chat/test-fixture"')
# Native swipe markup observed in the saved SpicyChat 4.7.3 pages.
NATIVE_CONTROLS = '<div class="flex items-center gap-2"><button type="button" aria-label="previous">‹</button><p>3/4</p><button type="button" aria-label="next">›</button></div>'


def fixture(start, total, *, number=True, firstlast=True):
    markup = NATIVE_CONTROLS
    return '''<!doctype html><html><body><div id="chat">
      <div id="message-stable-user">User message</div>
      <div id="message-generated-start">%s</div>
      <div id="message-stable-after">Another turn</div>
    </div><script>
    window.__DSQ_TAB_GATE__={paused:false};
    window.DragonScriptQoL={state:{settings:{enabled:true,showSwipeJumpButtons:%s,showSwipeJumpToNumber:%s,restoreFirstSwipeOnLoad:false}},setQuickStatus(message){window.latestStatus=message;}};
    window.swipeState={index:%d,total:%d,clicks:0};
    window.renderNative=()=>{
      const old = document.querySelector('#chat > div:nth-child(2)');
      const next = document.createElement('div');
      next.id='message-generated-'+window.swipeState.index;
      next.innerHTML=%s;
      next.querySelector('p').textContent=window.swipeState.index+'/'+window.swipeState.total;
      next.querySelector('button[aria-label="previous"]').disabled=window.swipeState.index===1;
      next.querySelector('button[aria-label="next"]').disabled=window.swipeState.index===window.swipeState.total;
      old.replaceWith(next);
    };
    document.addEventListener('click',event=>{
      const direction=event.target.closest('button')?.getAttribute('aria-label');
      if(direction!=='previous'&&direction!=='next')return;
      const previous=window.swipeState.index;
      window.swipeState.index=Math.max(1,Math.min(window.swipeState.total,previous+(direction==='previous'?-1:1)));
      if(previous!==window.swipeState.index){window.swipeState.clicks++;setTimeout(window.renderNative,15);}
    });
    window.renderNative();
    </script></body></html>''' % (markup, str(firstlast).lower(), str(number).lower(), start, total, json.dumps(markup))


def go(page, n):
    page.locator('[data-ds-swipe-target="number"] input').fill(str(n))
    page.locator('[data-ds-swipe-target="number"] button').click()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    try:
        page = browser.new_page()
        page.set_content(fixture(4, 4))
        page.add_script_tag(content=SOURCE)
        page.evaluate('DragonScriptQoL.applySwipeNavigation()')
        page.wait_for_selector('[data-ds-swipe-target="number"] input')
        order = page.locator('#chat > div:nth-child(2) button').evaluate_all('(els)=>els.map(x=>x.getAttribute("aria-label"))')
        assert order[0]=='Go to first generated reply' and order[1]=='previous' and order[2]=='next' and order[3]=='Go to most recent generated reply', order
        go(page, 2)
        page.wait_for_function('window.swipeState.index===2',timeout=8000)
        page.wait_for_timeout(260)
        assert page.evaluate('window.swipeState.clicks')==2
        go(page,4)
        page.wait_for_function('window.swipeState.index===4',timeout=8000)
        page.wait_for_timeout(260)
        go(page,0)
        assert 'between 1 and 4' in page.locator('[data-ds-swipe-target="number"] input').evaluate('(el)=>el.validationMessage')
        assert page.evaluate('window.swipeState.index')==4
        page.close()
        print('PASS: 4 -> 2 -> 4, invalid input rejected, controls ordered')
        page = browser.new_page()
        page.set_content(fixture(3,4,firstlast=False))
        page.add_script_tag(content=SOURCE)
        page.evaluate('DragonScriptQoL.applySwipeNavigation()')
        page.wait_for_selector('[data-ds-swipe-target="number"]')
        assert page.locator('button[data-ds-swipe-target="first"]').count()==0
        go(page,1)
        page.wait_for_function('window.swipeState.index===1',timeout=8000)
        page.evaluate('DragonScriptQoL.state.settings.showSwipeJumpToNumber=false; DragonScriptQoL.applySwipeNavigation()')
        page.wait_for_function('!document.querySelector("[data-ds-swipe-target=number]")',timeout=5000)
        print('PASS: number field independently enabled and cleaned up when disabled')
        page.close()
        page = browser.new_page()
        page.set_content(fixture(1000,1000))
        page.add_script_tag(content=SOURCE)
        page.evaluate('DragonScriptQoL.applySwipeNavigation()')
        page.wait_for_selector('[data-ds-swipe-target="number"]')
        go(page, 995)
        page.wait_for_function('window.swipeState.index===995',timeout=8000)
        page.wait_for_timeout(220)
        # A much longer jump must be stoppable, without skipping to a new page or changing saved history.
        go(page,1)
        page.wait_for_function('window.swipeState.clicks>=8',timeout=9000)
        page.wait_for_selector('[data-ds-swipe-target="number"] button')
        page.locator('[data-ds-swipe-target="number"] button').click()
        page.wait_for_function('!window.DragonScriptQoL.isSwipeNavigationActive || window.latestStatus?.includes("stopped")',timeout=8000)
        assert page.evaluate('window.swipeState.index')>1
        print('PASS: 1000 counter, number jump, cancellable long navigation')
        page.close()
    finally:
        browser.close()
