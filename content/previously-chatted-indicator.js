// Optional card badge. Uses existing opened-chat metadata. No network requests or new observers.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
  const BADGE = 'ds-chatted-indicator';
  function botId(href) {
    const input = String(href || '');
    const id = DS.botIdFromHref?.(input) || DS.chatIdFromHref?.(input) ||
      input.match(/\/(?:chatbot|chat)\/([0-9a-f-]{36})/i)?.[1] || '';
    return UUID.test(id) ? id.toLowerCase() : '';
  }
  function hasUserMessageInCurrentChat() {
    // SpicyChat currently uses the asymmetric right-hand user bubble. Do not
    // infer participation from seeing the bot greeting or merely opening a chat.
    return !!document.querySelector('[id^="message-"] .bg-blumine-6,[id^="message-"] .dark\\:bg-blumine-3');
  }
  let lastConfirmedChat = '';
  let saving = false;
  DS.applyPreviouslyChattedIndicator = function applyPreviouslyChattedIndicator() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enablePreviouslyChattedIndicator) {
      document.querySelectorAll('.' + BADGE).forEach(node => node.remove()); return;
    }
    const onChat = location.pathname.match(/^\/chat\/([0-9a-f-]{36})(?:\/|$)/i);
    if (onChat && !document.hidden && hasUserMessageInCurrentChat()) {
      const id = onChat[1].toLowerCase();
      if (id !== lastConfirmedChat && !saving) {
        lastConfirmedChat = id;
        const meta = DS.state.openedChatMeta ||= {};
        if (!meta[id]?.hasConfirmedUserMessage) {
          meta[id] = { ...(meta[id] || {}), hasConfirmedUserMessage: true };
          DS.state.openedChats?.add(id);
          saving = true;
          Promise.resolve(DS.saveOpenedChats?.()).finally(() => { saving = false; });
        }
      }
    }
    const anchors = document.querySelectorAll('a[href*="/chatbot/"], a[href*="/chat/"]');
    // Only touch existing card anchors; no global DOM mutation observer.
    for (const anchor of [...anchors].slice(0, 400)) {
      const id = botId(anchor.getAttribute('href'));
      if (!id || anchor.closest('#ds-qol-panel, [id^="message-"], header, [role="dialog"]')) continue;
      const card = anchor.closest('article,[data-testid*="card"],div[class*="card"],li') || anchor;
      if (!card || card.querySelectorAll('a[href*="/chatbot/"],a[href*="/chat/"]').length > 2) continue;
      const meta = DS.state?.openedChatMeta?.[id] || {};
      const confirmed = meta.hasConfirmedUserMessage === true || Number(meta.userMessageCount || 0) > 0;
      // An imported conversation may only contain a message count, so show an
      // explicitly distinct *uncertain* marker if the user opts in.
      const opened = DS.state?.openedChats?.has(id);
      const probable = meta.apiMetaCaptured === true && Number(meta.messageCount || 0) >= 2;
      const state = confirmed ? 'chatted' : probable ? 'probable' : opened && settings.chattedIndicatorShowOpened ? 'opened' : '';
      let badge = card.querySelector(':scope > .' + BADGE);
      if (!state) { badge?.remove(); continue; }
      if (!badge) { badge = document.createElement('span'); badge.className = BADGE; card.append(badge); }
      badge.dataset.state = state;
      badge.textContent = state === 'chatted' ? '●' : state === 'probable' ? '◉' : '○';
      badge.title = state === 'chatted' ? 'You have sent a message to this bot' : state === 'probable' ? 'Previous multi-message conversation (user reply not independently confirmed)' : 'Conversation opened; user message not confirmed';
      badge.setAttribute('aria-label', badge.title);
    }
  };
})();
}
