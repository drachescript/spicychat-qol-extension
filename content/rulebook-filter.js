// Passive Rulebook badge filter for My Creations. Off by default.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  const FILTER_ID = "ds-rulebook-filter-toolbar";
  const HIDDEN = "ds-rulebook-filter-hidden";
  function state(card) {
    if (card?.querySelector?.('[data-testid="RulebookBadge"], [data-rulebook-count]:not([data-rulebook-count="0"]), [data-rulebook-id], [aria-label="Rulebook attached"]')) return "has";
    const marked = card?.querySelector?.('[data-rulebook-count="0"], [data-rulebook-status="none"], [data-testid="NoRulebook"], [aria-label="No Rulebook"]');
    return marked ? "none" : "unknown";
  }
  function entries() {
    if (!DS.isMyCreationsChatbotsPage?.()) return [];
    const search = document.querySelector('[data-testid="BotListToolbarV2-SearchInput"]');
    let root = search?.closest('main, [role="main"]') || null;
    // My Creations does not always expose <main>. Follow the same content
    // scope rule as Lorebook filtering, never the navigation/app-shell grid.
    if (!root) {
      let node = search?.parentElement || null;
      for (let depth = 0; node && depth < 10; depth++, node = node.parentElement) {
        if (node.querySelector?.('[data-testid="BotListToolbarV2-Dropdowns"]') &&
            node.querySelector?.('a[href*="/chat/"], a[href*="/chatbot/"]') &&
            !node.querySelector?.('nav, [role="navigation"]')) { root = node; break; }
      }
    }
    root ||= document.querySelector('[data-testid="creation-tab-chatbots"]')?.closest('div.grow.flex.flex-col.relative');
    if (!root) return [];
    const seen = new Set();
    return (DS.collectCards?.() || []).flatMap(item => {
      const card = item?.card;
      if (!card || !root.contains(card) || seen.has(card) || card.closest('nav')) return [];
      seen.add(card);
      const target = DS.getBestHideTarget?.(card) || card;
      return target && root.contains(target) ? [{ card, target, state: state(card) }] : [];
    });
  }
  function clear() {
    document.querySelectorAll(`.${HIDDEN}`).forEach(node => node.classList.remove(HIDDEN));
    document.getElementById(FILTER_ID)?.remove();
  }
  DS.cardRulebookState = state;
  DS.removeRulebookListingTools = clear;
  DS.applyRulebookListingTools = function applyRulebookListingTools() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.showRulebookFilters || !DS.isMyCreationsChatbotsPage?.()) { clear(); return; }
    const items = entries();
    const search = document.querySelector('[data-testid="BotListToolbarV2-SearchInput"]');
    const toolbarHost = search?.closest('div.flex.gap-md.justify-between')?.parentElement || search?.parentElement?.parentElement;
    if (!toolbarHost) return;
    let toolbar = document.getElementById(FILTER_ID);
    if (!toolbar) {
      toolbar = document.createElement('div'); toolbar.id = FILTER_ID;
      toolbar.className = 'ds-rulebook-filter-toolbar';
      const label = document.createElement('label'); label.textContent = 'Rulebook ';
      const picker = document.createElement('select'); picker.id = 'ds-rulebook-filter-mode';
      for (const [value,title] of [['all','All'],['has','Has Rulebook'],['none','Confirmed No Rulebook'],['unknown','Unknown / unverified']]) {
        const option = document.createElement('option'); option.value = value; option.textContent = title; picker.append(option);
      }
      picker.addEventListener('change', () => { DS.state.rulebookFilterMode = picker.value; DS.applyRulebookListingTools(); });
      label.append(picker); toolbar.append(label);
      const summary = document.createElement('span'); summary.id = 'ds-rulebook-filter-count'; toolbar.append(summary);
      toolbarHost.append(toolbar);
    }
    const mode = DS.state.rulebookFilterMode || 'all';
    toolbar.querySelector('select').value = mode;
    const counts = {has:0,none:0,unknown:0};
    items.forEach(item => {
      counts[item.state]++;
      item.target.classList.toggle(HIDDEN, mode !== 'all' && mode !== item.state);
    });
    toolbar.querySelector('#ds-rulebook-filter-count').textContent = `${counts.has} attached · ${counts.none} confirmed none · ${counts.unknown} unknown`;
  };
})();
}
