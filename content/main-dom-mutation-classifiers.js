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
    return Array.from(node.classList || []).some(name => String(name).startsWith("ds-"));
  }

  function nodeContainsPersistentChatShortcut(node) {
    if (!(node instanceof Element)) return false;

    const selector = [
      ".ds-chat-asterisk-shortcut",
      ".ds-chat-asterisk-shortcut-wrapper",
      ".ds-chat-ooc-shortcut",
      ".ds-chat-ooc-shortcut-wrapper"
    ].join(",");

    return node.matches?.(selector) || !!node.querySelector?.(selector);
  }

  function mutationRemovedPersistentChatShortcut(mutation) {
    return [...mutation.removedNodes].some(nodeContainsPersistentChatShortcut);
  }

  function nodeContainsPersistentChatHeaderControl(node) {
    if (!(node instanceof Element)) return false;
    const selector = [
      ".ds-chat-topbar-later-button",
      ".ds-chat-history-button",
      ".ds-chat-new-chat-button",
      ".ds-chat-profile-button",
      ".ds-chat-search-button",
      ".ds-creator-fav-button",
      "#ds-chat-background-control",
      "#ds-android-qol-menu-button",
      "#ds-bot-organizer-context-button"
    ].join(",");
    return node.matches?.(selector) || !!node.querySelector?.(selector);
  }

  function mutationRemovedPersistentChatHeaderControl(mutation) {
    return [...mutation.removedNodes].some(nodeContainsPersistentChatHeaderControl);
  }

  function nodeContainsNativeChatHeader(node) {
    if (!(node instanceof Element)) return false;
    const selector = "a[aria-label='chatbot-profile'], button[aria-label='chat-dropdown']";
    return node.matches?.(selector) || !!node.querySelector?.(selector);
  }

  function mutationAddedNativeChatHeader(mutation) {
    return [...mutation.addedNodes].some(nodeContainsNativeChatHeader);
  }

  function mutationTouchesNativeChatHeader(mutation) {
    const target = mutation?.target instanceof Element ? mutation.target : mutation?.target?.parentElement;
    if (target && (nodeContainsNativeChatHeader(target) || target.closest?.("a[aria-label='chatbot-profile'], button[aria-label='chat-dropdown']"))) return true;
    return [...(mutation?.addedNodes || []), ...(mutation?.removedNodes || [])].some(nodeContainsNativeChatHeader);
  }

  function mutationIsOnlyQolUi(mutation) {
    if (typeof DS.mutationIsQolOnly === "function") return DS.mutationIsQolOnly(mutation);
    const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
    if (target?.closest?.("#ds-qol-panel, #ds-chat-export-modal")) return true;
    if (target && (nodeLooksQolOwned(target) || target.closest?.("[data-ds-owned='1']"))) return true;

    const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return nodes.length > 0 && nodes.every(nodeLooksQolOwned);
  }

  DS.mainDomMutationClassifiers = Object.freeze({
    mutationRemovedPersistentChatShortcut, mutationRemovedPersistentChatHeaderControl,
    mutationAddedNativeChatHeader, mutationTouchesNativeChatHeader, mutationIsOnlyQolUi
  });

})();
}
