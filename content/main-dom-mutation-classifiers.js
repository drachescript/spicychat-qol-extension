// Main runtime support: dom mutation classifiers.
// Loaded before main.js; no observers or page work start during module loading.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  function nodeLooksQolOwned(node) {
    if (!(node instanceof Element)) return false;
    if (node.dataset?.dsOwner === "qol" || node.dataset?.dsOwned === "1") return true;
    if (String(node.id || "").startsWith("ds-")) return true;
    // Avoid materializing class lists for every observer record. This path is
    // invoked continuously while React updates large listings and chats.
    for (const name of node.classList || []) {
      if (String(name).startsWith("ds-")) return true;
    }
    return false;
  }

  const PERSISTENT_SHORTCUT_SELECTOR = ".ds-chat-asterisk-shortcut,"
    + ".ds-chat-asterisk-shortcut-wrapper,.ds-chat-ooc-shortcut,.ds-chat-ooc-shortcut-wrapper";
  function nodeContainsPersistentChatShortcut(node) {
    if (!(node instanceof Element)) return false;
    return node.matches?.(PERSISTENT_SHORTCUT_SELECTOR) ||
      !!node.querySelector?.(PERSISTENT_SHORTCUT_SELECTOR);
  }

  function mutationRemovedPersistentChatShortcut(mutation) {
    for (const node of mutation.removedNodes || []) {
      if (nodeContainsPersistentChatShortcut(node)) return true;
    }
    return false;
  }

  const PERSISTENT_HEADER_SELECTOR = ".ds-chat-topbar-later-button,.ds-chat-history-button,"
    + ".ds-chat-new-chat-button,.ds-chat-profile-button,.ds-chat-search-button,"
    + ".ds-creator-fav-button,#ds-chat-background-control,#ds-android-qol-menu-button,"
    + "#ds-bot-organizer-context-button";
  function nodeContainsPersistentChatHeaderControl(node) {
    if (!(node instanceof Element)) return false;
    return node.matches?.(PERSISTENT_HEADER_SELECTOR) ||
      !!node.querySelector?.(PERSISTENT_HEADER_SELECTOR);
  }

  function mutationRemovedPersistentChatHeaderControl(mutation) {
    for (const node of mutation.removedNodes || []) {
      if (nodeContainsPersistentChatHeaderControl(node)) return true;
    }
    return false;
  }

  function nodeContainsNativeChatHeader(node) {
    if (!(node instanceof Element)) return false;
    const selector = "a[aria-label='chatbot-profile'], button[aria-label='chat-dropdown']";
    return node.matches?.(selector) || !!node.querySelector?.(selector);
  }

  function mutationAddedNativeChatHeader(mutation) {
    for (const node of mutation.addedNodes || []) {
      if (nodeContainsNativeChatHeader(node)) return true;
    }
    return false;
  }

  function mutationTouchesNativeChatHeader(mutation) {
    const target = mutation?.target instanceof Element ? mutation.target : mutation?.target?.parentElement;
    if (target && (nodeContainsNativeChatHeader(target) || target.closest?.("a[aria-label='chatbot-profile'], button[aria-label='chat-dropdown']"))) return true;
    for (const node of mutation?.addedNodes || []) {
      if (nodeContainsNativeChatHeader(node)) return true;
    }
    for (const node of mutation?.removedNodes || []) {
      if (nodeContainsNativeChatHeader(node)) return true;
    }
    return false;
  }

  function mutationIsOnlyQolUi(mutation) {
    if (typeof DS.mutationIsQolOnly === "function") return DS.mutationIsQolOnly(mutation);
    const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
    if (target?.closest?.("#ds-qol-panel, #ds-chat-export-modal")) return true;
    if (target && (nodeLooksQolOwned(target) || target.closest?.("[data-ds-owned='1']"))) return true;

    // A large React mutation may include hundreds of nodes; short-circuit
    // without allocating and copying both NodeLists on every callback.
    let sawNode = false;
    for (const node of mutation.addedNodes || []) {
      sawNode = true;
      if (!nodeLooksQolOwned(node)) return false;
    }
    for (const node of mutation.removedNodes || []) {
      sawNode = true;
      if (!nodeLooksQolOwned(node)) return false;
    }
    return sawNode;
  }

  DS.mainDomMutationClassifiers = Object.freeze({
    mutationRemovedPersistentChatShortcut, mutationRemovedPersistentChatHeaderControl,
    mutationAddedNativeChatHeader, mutationTouchesNativeChatHeader, mutationIsOnlyQolUi
  });

})();
}
