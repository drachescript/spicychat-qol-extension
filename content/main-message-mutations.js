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
    let changed = false;
    for (const nodes of [mutation?.addedNodes, mutation?.removedNodes]) {
      for (const node of nodes || []) {
        if (node?.nodeType !== Node.ELEMENT_NODE && !node?.parentElement) continue;
        changed = true;
        if (!nodeIsOrContainsChatMessage(node)) return false;
      }
    }
    return changed;
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
      for (const nodes of [mutation.addedNodes, mutation.removedNodes]) {
        for (const node of nodes || []) {
          if (!(node instanceof Element)) continue;
          if (!(node.matches?.("[id^='message-']") || node.closest?.("[id^='message-']") || node.querySelector?.("[id^='message-']"))) return false;
        }
      }
      return true;
    });
  }

  function mutationsAddOrRemoveMessageRoots(mutations) {
    for (const mutation of mutations) {
      for (const nodes of [mutation.addedNodes, mutation.removedNodes]) {
        for (const node of nodes || []) {
          if (!(node instanceof Element)) continue;
          if (node.matches?.("[id^='message-']") || (node.childElementCount > 0 && node.querySelector?.("[id^='message-']"))) return true;
        }
      }
    }
    return false;
  }

  function addedMessageRootCount(mutations) {
    const roots = new Set();
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.("[id^='message-']")) roots.add(node);
        if (node.childElementCount > 0) node.querySelectorAll?.("[id^='message-']").forEach(root => roots.add(root));
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
    const messageSelector = "div[id^='message-']";
    const textSelector = "div[class*='overflow-wrap']";
    const decorationSelector = "#ds-qol-panel, [data-ds-owned='1'], [data-ds-owner='qol'], .ds-message-quick-actions, .ds-message-bookmark-button, .ds-generation-metadata, .ds-rp-repair-toggle, .ds-translation-output, .ds-message-lorebook-button, .ds-chat-lorebook-pending, .ds-chat-lorebook-overlay";
    const textAncestorCache = new WeakMap();

    const isDecoration = node => {
      const el = node instanceof Element ? node : node?.parentElement;
      return !!el && !!(el.matches?.(decorationSelector) || el.closest?.(decorationSelector));
    };
    const insideText = node => {
      const el = node instanceof Element ? node : node?.parentElement;
      if (!el) return false;
      if (textAncestorCache.has(el)) return textAncestorCache.get(el);
      // Only inspect ancestors. A native action button added to the message
      // root must not invalidate text merely because that root CONTAINS a
      // different, unchanged message-text container.
      const matched = !!(el.matches?.(textSelector) || el.closest?.(textSelector));
      textAncestorCache.set(el, matched);
      return matched;
    };
    const containsTextHost = node => {
      const el = node instanceof Element ? node : null;
      return !!el && !!(el.matches?.(textSelector) || el.querySelector?.(textSelector));
    };

    for (const mutation of mutations) {
      candidateNodes += 1;
      const root = messageRootForMutationNode(mutation.target);
      if (root?.isConnected && mutation.type !== "attributes") {
        roots.add(root);
        if (mutation.type === "characterData") {
          if (!isDecoration(mutation.target) && insideText(mutation.target)) textRoots.add(root);
        } else if (mutation.type === "childList") {
          // Only read the changed nodes, not the whole message root. This is
          // important when React replaces action controls alongside streaming.
          const changed = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
          const textMutation = changed.some(node => !isDecoration(node) &&
            (insideText(mutation.target) || insideText(node) || containsTextHost(node)));
          if (textMutation) textRoots.add(root);
        }
      }
      for (const node of mutation.addedNodes || []) {
        candidateNodes += 1;
        if (!(node instanceof Element) || !node.isConnected) continue;
        // Only descend into the newly inserted subtree, never the existing
        // parent message list. Removed React subtrees are handled by the
        // independent mount/unmount tracker, not the text-cache invalidator.
        const mounted = node.matches?.(messageSelector) ? [node] :
          (node.querySelectorAll?.(messageSelector) || []);
        for (const child of mounted) {
          if (child.isConnected && !child.parentElement?.closest?.(messageSelector)) roots.add(child);
        }
      }
      candidateNodes += mutation.removedNodes?.length || 0;
    }

    const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
    counters.messageMutationCandidateNodes = Number(counters.messageMutationCandidateNodes || 0) + candidateNodes;
    counters.messageMutationDistinctRoots = Number(counters.messageMutationDistinctRoots || 0) + roots.size;
    counters.messageMutationTextRoots = Number(counters.messageMutationTextRoots || 0) + textRoots.size;
    counters.messageMutationNonTextRoots = Number(counters.messageMutationNonTextRoots || 0) + Math.max(0, roots.size - textRoots.size);
    return { roots, textRoots, candidateNodes };
  }

  DS.mainMessageMutations = Object.freeze({ nodeIsOrContainsChatMessage, mutationIsMessageScoped, mutationsAreComposerOnly, mutationsAreChatLocal, mutationsAddOrRemoveMessageRoots, addedMessageRootCount, messageRootForMutationNode, collectMessageCacheMutationTargets });
})();
}
