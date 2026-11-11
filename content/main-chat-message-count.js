// Stage 7: per-page loaded-chat count cache. No observers, requests or timers.
// React remounts are counted from already available MutationRecord batches.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  DS.createMainChatMessageCounter = ({ runtimeCounters }) => {
    let chatMessageCountCache = { route: "", count: 0, dirty: true };
    function loadedChatMessageCount() {
      if (!DS.isSingleChatPage?.()) return 0;
      const route = String(location.pathname || "");
      if (chatMessageCountCache.route !== route) {
        chatMessageCountCache = { route, count: 0, dirty: true };
      }
      if (chatMessageCountCache.dirty) {
        chatMessageCountCache.count = document.querySelectorAll("[id^='message-']").length;
        chatMessageCountCache.dirty = false;
      }
      return chatMessageCountCache.count;
    }

    // The Mini Panel and diagnostics reuse this counter instead of rescanning
    // every time the page is refreshed.
    function invalidateLoadedChatMessageCount() {
      chatMessageCountCache.dirty = true;
    }

    // One observer delivery is inspected by multiple shared performance lanes.
    // Cache structural roots for that specific immutable MutationRecord[] batch
    // rather than traversing each added/removed subtree again. Weak keys do
    // not retain old messages or conversation content.
    const messageRootMutationBatchCache = new WeakMap();
    function messageRootMutationSets(mutations) {
      if (Array.isArray(mutations)) {
        const cached = messageRootMutationBatchCache.get(mutations);
        if (cached) {
          const perf = runtimeCounters();
          perf.messageRootBatchCacheHits = Number(perf.messageRootBatchCacheHits || 0) + 1;
          return cached;
        }
      }
      const added = new Set();
      const removed = new Set();
      const collect = (node, target) => {
        if (!(node instanceof Element)) return;
        if (node.matches?.("[id^='message-']")) target.add(node);
        node.querySelectorAll?.("[id^='message-']").forEach(root => target.add(root));
      };
      for (const mutation of mutations || []) {
        for (const node of mutation.addedNodes || []) collect(node, added);
        for (const node of mutation.removedNodes || []) collect(node, removed);
      }
      // React can move the exact same node in one observer delivery. A move does
      // not change the number of loaded messages.
      for (const root of [...added]) {
        if (removed.has(root)) {
          added.delete(root);
          removed.delete(root);
        }
      }
      const result = { added, removed };
      if (Array.isArray(mutations)) messageRootMutationBatchCache.set(mutations, result);
      return result;
    }

    function updateLoadedChatMessageCountFromMutations(mutations) {
      if (!DS.isSingleChatPage?.()) return;
      const route = String(location.pathname || "");
      if (chatMessageCountCache.route !== route) {
        chatMessageCountCache = { route, count: 0, dirty: true };
        return;
      }
      if (chatMessageCountCache.dirty) return;
      const { added, removed } = messageRootMutationSets(mutations);
      if (!added.size && !removed.size) return;
      // Same message ID, different element: React replaced the native node.
      // Count remounts without recording IDs, message text or extra observers.
      if (added.size && removed.size) {
        const oldById = new Map([...removed].filter(root => root?.id).map(root => [root.id, root]));
        let remounts = 0;
        for (const root of added) if (root?.id && oldById.has(root.id) && oldById.get(root.id) !== root) remounts++;
        if (remounts) {
          const perf = runtimeCounters();
          perf.nativeMessageRemountsDetected = Number(perf.nativeMessageRemountsDetected || 0) + remounts;
        }
      }
      chatMessageCountCache.count = Math.max(0, Number(chatMessageCountCache.count || 0) + added.size - removed.size);
      const counters = runtimeCounters();
      counters.messageCountIncrementalUpdates = Number(counters.messageCountIncrementalUpdates || 0) + 1;
      counters.messageCountIncrementalRoots = Number(counters.messageCountIncrementalRoots || 0) + added.size + removed.size;
    }

    return { loadedChatMessageCount, invalidateLoadedChatMessageCount,
      messageRootMutationSets, updateLoadedChatMessageCountFromMutations };
  };
})();
}
