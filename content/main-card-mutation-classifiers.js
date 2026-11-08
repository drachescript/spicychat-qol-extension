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

  function mutationsMayAffectCards(mutations) {
    if (!isCardListingContext()) return false;

    return mutations.some(mutation => {
      if (elementMayBelongToCardArea(mutation.target)) return true;

      return [...mutation.addedNodes, ...mutation.removedNodes].some(node => {
        if (!(node instanceof Element)) return false;
        if (node.matches?.("a[href*='/chat/'], a[href*='/chatbot/']")) return true;
        return !!node.querySelector?.("a[href*='/chat/'], a[href*='/chatbot/']");
      });
    });
  }

  function mutationsAddBotCards(mutations) {
    if (!isCardListingContext()) return false;
    return mutations.some(mutation => [...(mutation.addedNodes || [])].some(node => {
      if (!(node instanceof Element)) return false;
      if (node.matches?.("a[href*='/chat/'], a[href*='/chatbot/']")) return true;
      return !!node.querySelector?.("a[href*='/chat/'], a[href*='/chatbot/']");
    }));
  }

  DS.mainCardMutationClassifiers = Object.freeze({
    isCardListingContext, mutationsMayAffectCards, mutationsAddBotCards
  });

})();
}
