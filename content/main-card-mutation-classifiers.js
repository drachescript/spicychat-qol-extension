// Main runtime support: card mutation classifiers.
// Loaded before main.js; no observers or page work start during module loading.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  function isCardListingContext() {
    const page = DS.getPageState?.() || {};
    // Rulebook Explore is a distinct listing with Rulebook IDs, not bot cards.
    // A chat link in the global navigation must not activate bot-card work.
    if (page.isRulebookExplorePage || page.routeType === "rulebook-explore") return false;
    if (page.isSingleChatPage || page.isChatListPage || page.isBotProfilePage || page.isBotEditor || page.isLorebookEditor || page.isPersonaPage) return false;
    if (["listing", "creator-listing", "lorebook-listing"].includes(page.routeType)) return true;
    return !!DS.qs?.("a[href*='/chat/'], a[href*='/chatbot/']");
  }

  function elementMayBelongToCardArea(element) {
    const node = element instanceof Element ? element : element?.parentElement;
    if (!node) return false;
    if (node.closest?.("a[href*='/chat/'], a[href*='/chatbot/']")) return true;
    // Only inspect ancestors that are themselves card shells. The old version
    // queried every ancestor for descendant links and could mark a *whole grid*
    // dirty when React changed an unrelated heading/sidebar sibling.
    return !!node.closest?.("div.relative.group.rounded-xl, div[class*='rounded-xl'][class*='group'], .ds-card-density-target");
  }

  // Cache per observer batch. The ordinary changed-card check must still
  // stop at its first match; searching for added cards is only needed during
  // the quiet period after a block operation.
  const batchCache = new WeakMap();
  const cardLinkSelector = "a[href*='/chat/'], a[href*='/chatbot/']";
  function cachedBatch(mutations) {
    let cache = batchCache.get(mutations);
    if (!cache) {
      cache = { affects: null, added: null, nodeMatches: new WeakMap() };
      batchCache.set(mutations, cache);
    }
    return cache;
  }
  function nodeHasCardLink(node, cache) {
    if (!(node instanceof Element)) return false;
    if (cache.nodeMatches.has(node)) return cache.nodeMatches.get(node);
    const matches = !!(node.matches?.(cardLinkSelector) || node.querySelector?.(cardLinkSelector));
    cache.nodeMatches.set(node, matches);
    return matches;
  }
  function mutationsMayAffectCards(mutations) {
    if (!isCardListingContext()) return false;
    const cache = cachedBatch(mutations);
    if (cache.affects !== null) return cache.affects;
    for (const mutation of mutations) {
      if (elementMayBelongToCardArea(mutation.target)) return (cache.affects = true);
      if (mutation.type !== "childList") continue;
      for (const nodes of [mutation.addedNodes, mutation.removedNodes]) {
        for (const node of nodes || []) {
          if (nodeHasCardLink(node, cache)) return (cache.affects = true);
        }
      }
    }
    return (cache.affects = false);
  }
  function mutationsAddBotCards(mutations) {
    if (!isCardListingContext()) return false;
    const cache = cachedBatch(mutations);
    if (cache.added !== null) return cache.added;
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;
      for (const node of mutation.addedNodes || []) {
        if (nodeHasCardLink(node, cache)) return (cache.added = true);
      }
    }
    return (cache.added = false);
  }

  DS.mainCardMutationClassifiers = Object.freeze({
    isCardListingContext, mutationsMayAffectCards, mutationsAddBotCards
  });

})();
}
