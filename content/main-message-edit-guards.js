// Main runtime support: message edit guards.
// Loaded before main.js; no observers or page work start during module loading.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  DS.createMainMessageEditGuards = function createMainMessageEditGuards({
    runtimeCounters, pauseReruns, getPauseRerunsUntil, desktopAppPerformanceGuardActive
  }) {
    const messageEditSettleTimers = new Map();
  function messageEditorInside(root) {
    return root?.querySelector?.("textarea, [contenteditable='true']") || null;
  }

  function messageEditTimerKey(root) {
    return String(root?.id || root?.dataset?.dsEditGuardKey || "");
  }

  function clearMessageEditSettleTimer(root) {
    const key = messageEditTimerKey(root);
    if (!key) return;
    const timer = messageEditSettleTimers.get(key);
    if (timer) clearTimeout(timer);
    messageEditSettleTimers.delete(key);
  }

  function finalizeMessageEditGuard(root, source = "settled") {
    if (!root) return;
    clearMessageEditSettleTimer(root);
    try { delete root.dataset.dsEditSavePending; } catch {}
    try { delete root.dataset.dsEditGuardSource; } catch {}
    try { delete root.dataset.dsEditGuardKey; } catch {}
    DS.state.activeMessageEditRoots?.delete?.(root);
    try { DS.invalidateMessageCacheForNode?.(root); } catch {}

    const counters = runtimeCounters();
    counters.messageEditGuardsSettled = Number(counters.messageEditGuardsSettled || 0) + 1;

    const delay = Math.max(60, Number(getPauseRerunsUntil() || 0) - Date.now() + 80);
    window.setTimeout(() => {
      if (!root?.isConnected || messageEditorInside(root)) return;
      DS.scheduleMessageLane?.(`message-edit-${source}`);
      DS.scheduleRun?.({ priority: "slow", source: `message-edit-${source}` });
    }, delay);
  }

  function prepareEditedMessageForSave(root, source = "editor") {
    if (!root?.isConnected) return;

    const activeRoots = DS.state.activeMessageEditRoots || (DS.state.activeMessageEditRoots = new Set());
    activeRoots.add(root);
    clearMessageEditSettleTimer(root);

    const alreadyPending = root.dataset.dsEditSavePending === "1";
    root.dataset.dsEditSavePending = "1";
    root.dataset.dsEditGuardSource = source;
    if (root.id) root.dataset.dsEditGuardKey = root.id;

    if (alreadyPending) {
      if (source === "save") pauseReruns(900);
      return;
    }

    const counters = runtimeCounters();
    counters.messageEditGuardsStarted = Number(counters.messageEditGuardsStarted || 0) + 1;

    // Remove only QoL display transforms before SpicyChat/React owns the editor.
    // This prevents a slow installed/PWA render from leaving a formatted clone of
    // the old message visible beside the native edit UI.
    try { DS.prepareRpFormatRepairMessageForEdit?.(root); } catch {}
    try { DS.prepareAlternateDialogueMessageForEdit?.(root); } catch {}
    try { DS.restoreChatTextReplacementsForMessage?.(root); } catch {}
    try { DS.invalidateMessageCacheForNode?.(root); } catch {}

    // Entry into edit mode only needs a very short quiet period. Save gets a bit
    // longer because high-latency React updates can keep the old tree around.
    pauseReruns(source === "save" ? 900 : 260);
  }

  function scheduleMessageEditGuardFinalize(root, source = "settled") {
    if (!root?.isConnected || root.dataset.dsEditSavePending !== "1") return;
    if (messageEditorInside(root)) {
      clearMessageEditSettleTimer(root);
      return;
    }

    const key = messageEditTimerKey(root);
    if (!key) return finalizeMessageEditGuard(root, source);
    clearMessageEditSettleTimer(root);
    const delay = desktopAppPerformanceGuardActive() ? 320 : 180;
    const timer = window.setTimeout(() => {
      messageEditSettleTimers.delete(key);
      if (!root?.isConnected) {
        DS.state.activeMessageEditRoots?.delete?.(root);
        return;
      }
      if (messageEditorInside(root)) return;
      finalizeMessageEditGuard(root, source);
    }, delay);
    messageEditSettleTimers.set(key, timer);
  }

  function messageRootFromNode(node) {
    const el = node instanceof Element ? node : node?.parentElement;
    if (!el) return null;
    if (el.matches?.("div[id^='message-']")) return el;
    return el.closest?.("div[id^='message-']") || null;
  }

  function syncMessageEditGuards(mutations) {
    if (!DS.isSingleChatPage?.()) return;
    const roots = new Set();
    for (const mutation of mutations || []) {
      // Plain streaming text mutations cannot create an editor. Inspect only
      // structural additions or a root already in the edit lifecycle.
      const targetRoot = messageRootFromNode(mutation.target);
      if (targetRoot?.dataset.dsEditSavePending === "1") roots.add(targetRoot);
      if (mutation.type !== "childList" || !mutation.addedNodes?.length) continue;
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        const possibleEditor = node.matches?.("textarea, [contenteditable='true']")
          || (node.childElementCount <= 16 && !!node.querySelector?.("textarea, [contenteditable='true']"));
        if (!possibleEditor) continue;
        const direct = messageRootFromNode(node) || targetRoot;
        if (direct) roots.add(direct);
        // A new message subtree can include multiple editable roots, but
        // searching the whole chat after every token is unnecessary.
        if (node.matches?.("div[id^='message-']")) roots.add(node);
        node.querySelectorAll?.("div[id^='message-'] textarea, div[id^='message-'] [contenteditable='true']").forEach(editor => {
          const root = messageRootFromNode(editor);
          if (root) roots.add(root);
        });
      }
    }

    for (const root of roots) {
      if (!root?.isConnected) continue;
      if (messageEditorInside(root)) prepareEditedMessageForSave(root, "editor");
      else if (root.dataset.dsEditSavePending === "1") scheduleMessageEditGuardFinalize(root, "settled");
    }
  }

  function nodeInsidePendingMessageEdit(node) {
    const root = messageRootFromNode(node);
    return !!(root && (root.dataset.dsEditSavePending === "1" || messageEditorInside(root)));
  }

  DS.hasActiveMessageEditor = function hasActiveMessageEditor() {
    const roots = DS.state.activeMessageEditRoots || (DS.state.activeMessageEditRoots = new Set());
    for (const root of [...roots]) {
      if (!root?.isConnected || !messageEditorInside(root)) roots.delete(root);
    }
    if (roots.size) return true;
    const editor = document.querySelector("div[id^='message-'] textarea, div[id^='message-'] [contenteditable='true']");
    const root = editor?.closest?.("div[id^='message-']");
    if (root) {
      roots.add(root);
      return true;
    }
    return false;
  };


    function resetMessageEditGuards() {
      messageEditSettleTimers.forEach(timer => clearTimeout(timer));
      messageEditSettleTimers.clear();
      DS.state?.activeMessageEditRoots?.clear?.();
    }
    return Object.freeze({
      prepareEditedMessageForSave, syncMessageEditGuards,
      nodeInsidePendingMessageEdit, resetMessageEditGuards
    });
  };

})();
}
