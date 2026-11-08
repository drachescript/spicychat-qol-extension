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
  const LANGUAGE_REASON = 'rulebook:language:';
  // Reuse the existing page observer. No extra MutationObserver or polling.
  // A runtime pass needs to inspect only cards that native React changed.
  const changedExploreCards = new Set();
  let fullExploreRefresh = true;
  let pickerDirty = true;
  let lastConfigSignature = "";
  let lastRoute = '';
  let lastMode = '';
  let activeLastTime = false;
  let lastSlowDiagnosticAt = 0;
  let lastFullRefreshAt = 0;
  // Native React may touch the same card repeatedly without changing its
  // searchable fields. Keep only cheap per-element snapshots, not metadata
  // lists or a second observer.
  let cardResults = new WeakMap();
  const text = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const list = v => [...new Set((Array.isArray(v) ? v : []).map(text).filter(Boolean))];
  const norm = v => DS.searchableTextForMatching?.(v) || text(v).toLowerCase();
  const compact = v => norm(String(v || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2')).replace(/[^\p{L}\p{N}]/gu, '');
  function compileMatcher(value) {
    return { value, normalized: norm(value), compact: compact(value) };
  }
  function firstMatch(values, rules) {
    if (!rules?.length || !values?.length) return '';
    const prepared = values.map(value => ({ normalized: norm(value), compact: compact(value) }));
    for (const rule of rules) {
      if (prepared.some(value => value.normalized.includes(rule.normalized) ||
          (rule.compact.length >= 3 && value.compact.includes(rule.compact)))) return rule.value;
    }
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
  function compiledRules(settings) {
    return {
      ids: new Set(list(settings.rulebookBlockedIds).map(id => id.toLowerCase())),
      words: list(settings.blockedWords).map(compileMatcher).filter(rule => rule.normalized),
      creators: list(settings.blockedCreators).map(compileMatcher).filter(rule => rule.normalized),
      tags: list(settings.blockedTags).map(compileMatcher).filter(rule => rule.normalized)
    };
  }
  function reasonFor(meta, settings, rules = compiledRules(settings)) {
    if (meta.id && rules.ids.has(meta.id)) return `id:${meta.id}`;
    if (!(settings.applyBotBlockingToRulebooks === true && settings.blockCards === true)) return '';
    const word = firstMatch([meta.name, meta.description], rules.words);
    if (word) return `word:${word}`;
    const creator = firstMatch(meta.creators, rules.creators);
    if (creator) return `creator:${creator}`;
    const tag = firstMatch(meta.tags, rules.tags);
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
    if (activeLastTime) {
      document.querySelectorAll(`[data-ds-reason^="${REASON}"], [data-ds-reason^="${LANGUAGE_REASON}"]`).forEach(el => DS.unhideElement?.(el));
      document.querySelectorAll(BUTTON).forEach(el => el.remove());
    }
    activeLastTime = false;
    lastConfigSignature = "";
    lastMode = '';
    fullExploreRefresh = true;
    pickerDirty = true;
    changedExploreCards.clear();
    cardResults = new WeakMap();
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
      fullExploreRefresh = true;
      pickerDirty = true;
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
  // The global QoL page observer already sees native React mutations. Use
  // those existing batches to mark changed Explore cards; do not observe the
  // whole page a second time or rebuild unchanged card metadata on scroll.
  DS.rulebookExploreMutationsRelevant = function rulebookExploreMutationsRelevant(mutations) {
    if (!isExplore() || !Array.isArray(mutations) || !mutations.length) return false;
    let relevant = false;
    const mark = card => {
      if (!card || !card.isConnected) return;
      changedExploreCards.add(card);
      relevant = true;
    };
    for (const mutation of mutations) {
      const target = mutation.target?.nodeType === 1 ? mutation.target : mutation.target?.parentElement;
      // Button/badge animation inside our own card controls cannot alter
      // native Rulebook metadata and must not trigger another processing pass.
      if (target?.closest?.(BUTTON)) continue;
      mark(target?.closest?.(EXPLORE_CARD));
      for (const node of mutation.addedNodes || []) {
        if (node?.nodeType !== 1) continue;
        if (node.matches?.(EXPLORE_CARD)) mark(node);
        else if (node.childElementCount > 0) {
          // Only inspect the actual newly added subtree, never the page/root.
          node.querySelectorAll?.(EXPLORE_CARD).forEach(mark);
        }
      }
    }
    return relevant;
  };
  // Only native Discover mount/search/sort mutations invalidate the chat
  // slow lane. Streaming replies and unrelated chat UI changes cannot do so.
  DS.rulebookDiscoverMutationsRelevant = function rulebookDiscoverMutationsRelevant(mutations) {
    if (!Array.isArray(mutations) || !mutations.length) return false;
    for (const mutation of mutations) {
      const target = mutation.target?.nodeType === 1 ? mutation.target : mutation.target?.parentElement;
      if (target?.closest?.(PICKER)) { pickerDirty = true; return true; }
      for (const node of [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])]) {
        if (node?.nodeType !== 1) continue;
        if (node.matches?.(PICKER_CARD) || node.matches?.('[data-testid="ConversationRulebookPicker-Modal"], [data-testid="RulebookDiscoverTab"]') || node.querySelector?.('[data-testid="RulebookDiscoverTab"]')) {
          pickerDirty = true;
          return true;
        }
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
    const picker = explore ? null : document.querySelector(PICKER);
    const languageActive = settings.enableLanguageFilter === true && settings.languageFilterRulebooks === true;
    if ((!explore && !picker) || settings.enabled !== true || (settings.rulebookBlockingEnabled !== true && !languageActive)) {
      if (activeLastTime) restore();
      return;
    }
    const mode = explore ? 'explore' : 'picker';
    const route = String(location.pathname || '');
    // Settings may be patched in place, so reference equality alone is not
    // sufficient. The small relevant-rule signature prevents stale filtering.
    const configSignature = JSON.stringify([
      settings.enabled, settings.rulebookBlockingEnabled,
      settings.applyBotBlockingToRulebooks, settings.blockCards,
      settings.showRulebookBlockButtons, settings.rulebookBlockedIds,
      settings.blockedWords, settings.blockedCreators, settings.blockedTags,
      settings.enableLanguageFilter, settings.languageFilterRulebooks,
      settings.allowedLanguages, settings.languageSelectionMode
    ]);
    if (lastConfigSignature !== configSignature || lastRoute !== route || lastMode !== mode) {
      fullExploreRefresh = true;
      pickerDirty = true;
    }
    lastConfigSignature = configSignature;
    lastRoute = route;
    lastMode = mode;
    activeLastTime = true;
    // Rare reconciliation for native attribute-only changes that the shared
    // observer deliberately does not watch. No new timer or polling is added.
    if (explore && Date.now() - lastFullRefreshAt > 60000) fullExploreRefresh = true;
    if (explore && !fullExploreRefresh && changedExploreCards.size === 0) {
      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.rulebookExploreUnchangedPassesSkipped = Number(perf.rulebookExploreUnchangedPassesSkipped || 0) + 1;
      return;
    }
    if (!explore && !pickerDirty) return;
    const startedAt = performance.now();
    const isFullExplorePass = explore && fullExploreRefresh;
    if (isFullExplorePass) lastFullRefreshAt = Date.now();
    const cards = explore
      ? (fullExploreRefresh ? document.querySelectorAll(EXPLORE_CARD) : [...changedExploreCards])
      : picker.querySelectorAll(PICKER_CARD);
    fullExploreRefresh = false;
    pickerDirty = false;
    changedExploreCards.clear();
    const rules = compiledRules(settings);
    let checked = 0;
    let unchanged = 0;
    for (const card of cards) {
      if (!card.isConnected) continue;
      const meta = metaFor(card);
      if (!UUID.test(meta.id)) continue;
      const target = targetFor(card);
      const signature = JSON.stringify(meta);
      const currentReason = String(target?.dataset?.dsReason || '');
      const wantsButton = settings.rulebookBlockingEnabled === true && settings.showRulebookBlockButtons === true;
      const buttonPresent = !!card.querySelector(BUTTON);
      const prior = cardResults.get(card);
      const priorReason = String(prior?.appliedReason || '');
      const stillApplied = priorReason
        ? (currentReason === priorReason && target?.dataset?.dsHidden === '1' && target?.classList?.contains('ds-hidden'))
        : (!currentReason || (!currentReason.startsWith(REASON) && !currentReason.startsWith(LANGUAGE_REASON)));
      if (prior && prior.target === target && prior.signature === signature &&
          prior.config === configSignature && buttonPresent === wantsButton && stillApplied) {
        unchanged++;
        continue;
      }
      checked += 1;
      buttonFor(card, meta, settings);
      const why = settings.rulebookBlockingEnabled === true ? reasonFor(meta, settings, rules) : '';
      const language = !why && languageActive
        ? DS.getPublicListingLanguageHideReason?.(meta, 'rulebook') || '' : '';
      let desiredReason = why ? REASON + why : language ? LANGUAGE_REASON + language : '';
      if (desiredReason && !currentReason && target?.dataset?.dsHidden === '1') {
        // Do not overwrite a separate feature's hidden state.
        desiredReason = '';
      }
      if (desiredReason) {
        if (!currentReason || currentReason.startsWith(REASON) || currentReason.startsWith(LANGUAGE_REASON)) {
          if (currentReason !== desiredReason || target?.dataset?.dsHidden !== '1' || !target?.classList?.contains('ds-hidden')) {
            DS.hideElement?.(target, desiredReason);
          }
        }
      } else if (currentReason.startsWith(REASON) || currentReason.startsWith(LANGUAGE_REASON)) DS.unhideElement?.(target);
      cardResults.set(card, { target, signature, config: configSignature, appliedReason: desiredReason });
    }
    if (explore) {
      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.rulebookExploreScans = Number(perf.rulebookExploreScans || 0) + 1;
      perf.rulebookExploreCardsChecked = Number(perf.rulebookExploreCardsChecked || 0) + checked;
      perf.rulebookExploreUnchangedCardsSkipped = Number(perf.rulebookExploreUnchangedCardsSkipped || 0) + unchanged;
      const durationMs = performance.now() - startedAt;
      perf.rulebookExploreWorstScanMs = Math.max(Number(perf.rulebookExploreWorstScanMs || 0), Math.round(durationMs * 10) / 10);
      if (durationMs >= 24 && Date.now() - lastSlowDiagnosticAt > 3000) {
        lastSlowDiagnosticAt = Date.now();
        DS.diagPerformance?.('rulebook-explore-slow-scan', { durationMs: Math.round(durationMs * 10) / 10, cards: checked });
      }
    }
  };

})();
}
