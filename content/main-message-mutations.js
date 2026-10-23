// DOM mutation classifiers used by the main scheduler; no listeners or timers.
// They are independent so Lite builds can reuse only the message-analysis logic.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  function nodeIsOrContainsChatMessage(node) {
    const el = node instanceof Element ? node : node?.parentElement;
    if (!el) return false;
    return !!(el.matches?.("[id^='message-']") || el.closest?.("[id^='message-']") || el.querySelector?.("[id^='message-']"));
  }

  function mutationIsMessageScoped(mutation) {
    const target = mutation?.target instanceof Element ? mutation.target : mutation?.target?.parentElement;
    if (target?.closest?.("[id^='message-']")) return true;
    const changed = [...(mutation?.addedNodes || []), ...(mutation?.removedNodes || [])]
      .filter(node => node?.nodeType === Node.ELEMENT_NODE || node?.parentElement);
    return changed.length > 0 && changed.every(nodeIsOrContainsChatMessage);
  }

  function mutationsAreComposerOnly(mutations) {
    if (!DS.isSingleChatPage?.() || !mutations.length) return false;
    return mutations.every(mutation => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      return !!target?.closest?.("textarea, [contenteditable='true']");
    });
  }

  function mutationsAreChatLocal(mutations) {
    if (!DS.isSingleChatPage?.()) return false;
    return mutations.every(mutation => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      if (!target) return false;
      if (target.closest?.("[id^='message-'], textarea, [contenteditable='true']")) return true;
      return [...mutation.addedNodes, ...mutation.removedNodes].every(node => {
        if (!(node instanceof Element)) return true;
        return !!(node.matches?.("[id^='message-']") || node.closest?.("[id^='message-']") || node.querySelector?.("[id^='message-']"));
      });
    });
  }

  function mutationsAddOrRemoveMessageRoots(mutations) {
    return mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes].some(node => {
      if (!(node instanceof Element)) return false;
      return !!(node.matches?.("[id^='message-']") || node.querySelector?.("[id^='message-']"));
    }));
  }

  function addedMessageRootCount(mutations) {
    const roots = new Set();
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.("[id^='message-']")) roots.add(node);
        node.querySelectorAll?.("[id^='message-']").forEach(root => roots.add(root));
      }
    }
    return roots.size;
  }

  function messageRootForMutationNode(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    if (!element) return null;
    if (element.matches?.("[id^='message-']")) return element;
    return element.closest?.("[id^='message-']") || null;
  }

  function collectMessageCacheMutationTargets(mutations) {
    const roots = new Set();
    const textRoots = new Set();
    let candidateNodes = 0;
    const qolMessageDecorationSelector = "#ds-qol-panel, [data-ds-owned='1'], [data-ds-owner='qol'], .ds-message-quick-actions, .ds-message-bookmark-button, .ds-generation-metadata, .ds-rp-repair-toggle, .ds-translation-output, .ds-message-lorebook-button, .ds-chat-lorebook-pending, .ds-chat-lorebook-overlay";

    const touchesMessageText = node => {
      const element = node instanceof Element ? node : node?.parentElement;
      if (!element) return false;
      if (element.matches?.(qolMessageDecorationSelector) || element.closest?.(qolMessageDecorationSelector)) return false;
      if (element.matches?.("div[class*='overflow-wrap']")) return true;
      if (element.closest?.("div[class*='overflow-wrap']")) return true;
      return !!element.querySelector?.("div[class*='overflow-wrap']");
    };

    const addNode = (node, scanDescendants = false) => {
      candidateNodes += 1;
      const root = messageRootForMutationNode(node);
      if (root) {
        roots.add(root);
        if (touchesMessageText(node)) textRoots.add(root);
        return;
      }
      // A MutationRecord target can be the entire chat/message-list container.
      // Never scan all of its descendants or one appended message would turn
      // into a full-chat invalidation. Descendant scanning is only appropriate
      // for the actual added/removed subtree.
      if (!scanDescendants) return;
      const element = node instanceof Element ? node : node?.parentElement;
      if (!element) return;
      element.querySelectorAll?.("[id^='message-']").forEach(messageRoot => {
        roots.add(messageRoot);
        textRoots.add(messageRoot);
      });
    };

    for (const mutation of mutations) {
      addNode(mutation.target, false);
      for (const node of mutation.addedNodes || []) addNode(node, true);
      for (const node of mutation.removedNodes || []) addNode(node, true);
    }

    const counters=DS.state.runtimePerformance||(DS.state.runtimePerformance={});
    counters.messageMutationCandidateNodes=(counters.messageMutationCandidateNodes||0)+candidateNodes;
    counters.messageMutationDistinctRoots=(counters.messageMutationDistinctRoots||0)+roots.size;
    // Counts scoped to actual native message text vs QoL-owned decoration churn.
    counters.messageMutationTextRoots=(counters.messageMutationTextRoots||0)+textRoots.size;
    return { roots, textRoots, candidateNodes };
  }

  DS.mainMessageMutations = Object.freeze({ nodeIsOrContainsChatMessage, mutationIsMessageScoped, mutationsAreComposerOnly, mutationsAreChatLocal, mutationsAddOrRemoveMessageRoots, addedMessageRootCount, messageRootForMutationNode, collectMessageCacheMutationTargets });
})();
}
