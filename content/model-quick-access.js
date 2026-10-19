// Optional Model Quick Access feature. No recurring observers or background timers.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const ID = 'ds-model-quick-access';
  const norm = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const ordered = text => [...new Map(String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, 30).map(x => [norm(x), x])).values()];
  const visible = el => !!(el?.isConnected && el.getClientRects().length);

  function candidateRows(scope = document) {
    return [...scope.querySelectorAll('div[class*="cursor-pointer"]')]
      .filter(el => visible(el) && !el.querySelector('div[class*="cursor-pointer"]'))
      .map(el => ({el, text: norm([...el.querySelectorAll('p')].map(x => x.textContent || '')[0] || '')}))
      .filter(row => row.text);
  }
  function selectExisting(name, scope = document) {
    const wanted = norm(name);
    const target = candidateRows(scope).find(row => row.text === wanted)?.el;
    if (!target) return false;
    target.click(); // delegates to the existing native model picker, no fabricated API calls
    return true;
  }
  function findModelMenu() {
    const labels = [...document.querySelectorAll('p,span')].filter(node => visible(node) &&
      /^(available models|explore all models|select a model)$/i.test(norm(node.textContent)));
    for (const label of labels.slice(0, 10)) {
      let node = label.parentElement;
      for (let i = 0; node && i < 8; i++, node = node.parentElement) {
        if (node.querySelectorAll('div[class*="cursor-pointer"]').length >= 2 && visible(node) &&
            node.textContent.length < 15000) return node;
      }
    }
    return null;
  }
  function exploreAll(menu) {
    const element = [...menu.querySelectorAll('button,div[role="button"],div[class*="cursor-pointer"]')]
      .find(el => norm(el.textContent) === 'explore all models');
    if (element) element.click();
    return !!element;
  }
  function choose(name, menu, note) {
    if (selectExisting(name, menu)) return;
    if (!exploreAll(menu)) {
      note.textContent = `Open Explore all models to select ${name}.`;
      return;
    }
    // Only after a user click. Bounded retries handle React's asynchronous modal mount.
    let attempts = 0;
    const finish = () => {
      if (DS.isQolPausedForTab?.() || !DS.state?.settings?.enableModelQuickAccess) return;
      if (selectExisting(name)) return;
      if (++attempts < 8) setTimeout(finish, 170);
      else if (note.isConnected) note.textContent = `${name} was not found. Select it in Explore All manually.`;
    };
    setTimeout(finish, 100);
  }
  function cleanup() { document.getElementById(ID)?.remove(); }
  DS.applyModelQuickAccess = function applyModelQuickAccess() {
    const settings = DS.state?.settings || {};
    const names = ordered(settings.modelQuickAccessNames);
    if (!settings.enabled || !settings.enableModelQuickAccess || !names.length || !DS.isSingleChatPage?.()) {
      cleanup(); return;
    }
    const menu = findModelMenu();
    if (!menu) { cleanup(); return; }
    const signature = names.map(norm).join('|');
    let host = document.getElementById(ID);
    if (host && host.parentElement !== menu) { host.remove(); host = null; }
    if (host?.dataset.signature === signature) return;
    if (!host) { host = document.createElement('div'); host.id = ID; host.className = 'ds-model-quick-access'; }
    host.replaceChildren(); host.dataset.signature = signature;
    const title = document.createElement('div'); title.className = 'ds-model-quick-access-title';
    title.textContent = 'My quick models'; host.append(title);
    const buttons = document.createElement('div'); buttons.className = 'ds-model-quick-access-buttons';
    const note = document.createElement('div'); note.className = 'ds-model-quick-access-note';
    for (const name of names) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = name;
      button.title = `Select ${name}`;
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); choose(name, menu, note); });
      buttons.append(button);
    }
    host.append(buttons, note);
    menu.prepend(host); // own shortcut area; native rows are never reordered or hidden
  };
})();
}
