// Optional public Rulebook card blocking. Uses local QoL rules; never changes SpicyChat Rulebooks.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS || window.__DSQ_RULEBOOK_CARD_BLOCKING__) return;
  window.__DSQ_RULEBOOK_CARD_BLOCKING__ = true;

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const EXPLORE_CARD = '[data-testid="RulebookListCard"][data-rulebook-id]';
  const PICKER_CARD = '[data-testid^="RulebookDiscoverTab-Card-"][data-rulebook-id]';
  const PICKER = '[data-testid="ConversationRulebookPicker-Modal"] [data-testid="RulebookDiscoverTab"]';
  const BUTTON = '.ds-rulebook-block-button';
  const REASON = 'rulebook:block:';
  const text = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const list = v => [...new Set((Array.isArray(v) ? v : []).map(text).filter(Boolean))];
  const norm = v => DS.searchableTextForMatching?.(v) || text(v).toLowerCase();
  const compact = v => norm(String(v || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2')).replace(/[^\p{L}\p{N}]/gu, '');
  function matches(haystack, rule) {
    const needle = norm(rule);
    return !!needle && (norm(haystack).includes(needle) || (compact(rule).length >= 3 && compact(haystack).includes(compact(rule))));
  }
  function firstMatch(values, rules) {
    for (const rule of list(rules)) if (values.some(value => matches(value, rule))) return rule;
    return '';
  }
  function isExplore() {
    return /^\/rulebooks\/explore(?:\/|$)/i.test(String(location.pathname || ''));
  }
  function metaFor(card) {
    const id = text(card?.getAttribute('data-rulebook-id')).toLowerCase();
    const creatorNode = card?.querySelector('[data-testid="RulebookListCard-CreatorLink"], [data-testid$="-Creator"]');
    const creatorHref = creatorNode?.getAttribute('href') || '';
    const creatorHandle = decodeURIComponent(creatorHref.split('/creator/')[1]?.split(/[?#/]/)[0] || '');
    const descNode = card?.querySelector('[data-testid="RulebookListCard-Description"]');
    const tags = [];
    // Rulebook meter chips (Trust, Health etc.) are NOT tags. Match actual tagged
    // metadata only if the site supplies it; otherwise word/creator/ID rules work.
    card?.querySelectorAll('[data-tag-name], [data-tag-names], [data-tags]').forEach(el => {
      const n = el.getAttribute('data-tag-name');
      if (n) tags.push(n);
      const multi = el.getAttribute('data-tags') || el.getAttribute('data-tag-names');
      if (multi) tags.push(...multi.split(/[,;|]/));
    });
    return {
      id,
      name: text(card?.querySelector('[data-testid="RulebookListCard-Name"]')?.textContent || card?.querySelector('[data-testid="RulebookListCard-OpenButton"]')?.getAttribute('title')),
      description: text(descNode?.getAttribute('title') || descNode?.textContent),
      creators: [text(creatorNode?.textContent), creatorHandle, creatorHandle ? '@' + creatorHandle : ''].filter(Boolean),
      tags: list(tags)
    };
  }
  function reasonFor(meta, settings) {
    const ids = list(settings.rulebookBlockedIds).map(id => id.toLowerCase());
    if (meta.id && ids.includes(meta.id)) return `id:${meta.id}`;
    if (!(settings.applyBotBlockingToRulebooks === true && settings.blockCards === true)) return '';
    const word = firstMatch([meta.name, meta.description], settings.blockedWords);
    if (word) return `word:${word}`;
    const creator = firstMatch(meta.creators, settings.blockedCreators);
    if (creator) return `creator:${creator}`;
    const tag = firstMatch(meta.tags, settings.blockedTags);
    if (tag) return `tag:${tag}`;
    return '';
  }
  function targetFor(card) {
    // Discover cards share a single flex results column. Never hide their
    // parent: that would remove every choice from the native picker.
    if (card?.matches?.(PICKER_CARD)) return card;
    const wrapper = card?.parentElement;
    const grid = wrapper?.parentElement;
    return wrapper && wrapper.children.length === 1 && grid?.classList?.contains('grid') ? wrapper : card;
  }
  function restore() {
    document.querySelectorAll(`[data-ds-reason^="${REASON}"]`).forEach(el => DS.unhideElement?.(el));
    document.querySelectorAll(BUTTON).forEach(el => el.remove());
  }
  async function block(meta, card, button) {
    if (!UUID.test(meta.id)) return;
    button.disabled = true;
    const old = list(DS.state?.settings?.rulebookBlockedIds).map(v => v.toLowerCase());
    if (!old.includes(meta.id)) old.push(meta.id);
    try {
      const saved = await DS.saveSettingsPatch?.({ rulebookBlockedIds: old });
      if (saved === false) throw new Error('Rulebook block not saved');
      DS.hideElement?.(targetFor(card), REASON + 'id:' + meta.id);
      DS.setQuickStatus?.(`Blocked Rulebook: ${meta.name || meta.id}`);
    } catch {
      button.disabled = false;
      DS.setQuickStatus?.('Could not save Rulebook block.');
    }
  }
  function buttonFor(card, meta, settings) {
    const old = card.querySelector(BUTTON);
    if (!(settings.rulebookBlockingEnabled === true && settings.showRulebookBlockButtons === true && UUID.test(meta.id))) {
      old?.remove(); return;
    }
    if (old) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ds-rulebook-block-button';
    button.dataset.dsOwned = '1';
    button.setAttribute('aria-label', 'Block this Rulebook');
    button.title = 'Block this Rulebook in QoL';
    button.textContent = '×';
    // Standalone cards have a native More button; picker cards do not.
    const inPicker = card.matches(PICKER_CARD);
    Object.assign(button.style, {
      position: 'absolute', top: '8px', right: inPicker ? '8px' : '44px', zIndex: '12',
      width: '28px', height: '28px', borderRadius: '999px', border: '0',
      background: 'rgba(0,0,0,.7)', color: '#fff', fontSize: '21px',
      lineHeight: '24px', cursor: 'pointer', padding: '0'
    });
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      void block(meta, card, button);
    }, true);
    card.appendChild(button);
  }
  // Use the existing page observer. Only native Discover mount/search/sort
  // mutations invalidate the targeted chat slow lane; streaming replies and
  // ordinary chat UI updates do not cause Rulebook-card rescans.
  DS.rulebookDiscoverMutationsRelevant = function rulebookDiscoverMutationsRelevant(mutations) {
    if (!Array.isArray(mutations) || !mutations.length) return false;
    for (const mutation of mutations) {
      const target = mutation.target?.nodeType === 1 ? mutation.target : mutation.target?.parentElement;
      if (target?.closest?.(PICKER)) return true;
      for (const node of [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])]) {
        if (node?.nodeType !== 1) continue;
        if (node.matches?.(PICKER_CARD) || node.matches?.('[data-testid="ConversationRulebookPicker-Modal"], [data-testid="RulebookDiscoverTab"]')) return true;
        if (node.querySelector?.('[data-testid="RulebookDiscoverTab"]')) return true;
      }
    }
    return false;
  };
  DS.removePublicRulebookQoL = restore;
  DS.getPublicRulebookCardMeta = metaFor;
  DS.getPublicRulebookBlockReason = meta => {
    const settings = DS.state?.settings || {};
    return settings.rulebookBlockingEnabled === true ? reasonFor(meta || {}, settings) : '';
  };
  DS.applyPublicRulebookQoL = function applyPublicRulebookQoL() {
    const settings = DS.state?.settings || {};
    const explore = isExplore();
    const picker = document.querySelector(PICKER);
    if ((!explore && !picker) || settings.enabled !== true || settings.rulebookBlockingEnabled !== true) {
      restore(); return;
    }
    const cards = explore
      ? document.querySelectorAll(EXPLORE_CARD)
      : picker.querySelectorAll(PICKER_CARD);
    for (const card of cards) {
      const meta = metaFor(card);
      if (!UUID.test(meta.id)) continue;
      buttonFor(card, meta, settings);
      const target = targetFor(card);
      const why = reasonFor(meta, settings);
      if (why) DS.hideElement?.(target, REASON + why);
      else if (String(target?.dataset?.dsReason || '').startsWith(REASON)) DS.unhideElement?.(target);
    }
  };
})();
}
