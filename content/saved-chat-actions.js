(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  const ACTIONS = [
    { label: "Change Title", icon: "✎", className: "" },
    { label: "Clone Conversation", icon: "⧉", className: "" },
    { label: "Remove Conversation", icon: "×", className: "ds-saved-chat-remove-action" }
  ];

  function isSavedConversationPage() {
    return /^\/chats\/[^/]+\/?$/i.test(location.pathname);
  }

  function isVisible(el) {
    if (!el?.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    return !!(rect.width || rect.height);
  }

  function waitFor(predicate, timeoutMs = 1200, intervalMs = 40) {
    return new Promise(resolve => {
      const started = Date.now();

      const tick = () => {
        let value = null;
        try { value = predicate(); } catch {}
        if (value) return resolve(value);
        if (Date.now() - started >= timeoutMs) return resolve(null);
        setTimeout(tick, intervalMs);
      };

      tick();
    });
  }

  function findCard(trigger) {
    let node = trigger?.parentElement;

    for (let i = 0; node && i < 8; i++, node = node.parentElement) {
      const chatLink = node.querySelector?.('a[href*="/chat/"]');
      const menuTriggers = node.querySelectorAll?.('button[aria-label="EllipsisVertical-button"]') || [];

      if (chatLink && menuTriggers.length === 1 && menuTriggers[0] === trigger) {
        try {
          const url = new URL(chatLink.href, location.origin);
          if (/^\/chat\/[^/]+\/[^/]+\/?$/i.test(url.pathname)) {
            return { card: node, chatLink };
          }
        } catch {}
      }
    }

    return null;
  }

  async function openNativeMenu(trigger) {
    if (!trigger) return false;

    try { trigger.click(); } catch {}

    let opened = await waitFor(() =>
      ACTIONS.some(action => DS.qsa(`button[aria-label="${action.label}"]`).some(isVisible)),
    750, 35);

    if (opened) return true;

    if (trigger.getAttribute("aria-expanded") !== "true") {
      try {
        trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
        trigger.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
        trigger.click();
      } catch {}

      opened = await waitFor(() =>
        ACTIONS.some(action => DS.qsa(`button[aria-label="${action.label}"]`).some(isVisible)),
      750, 35);
    }

    return !!opened;
  }

  async function invokeNativeAction(trigger, actionLabel, host) {
    if (!trigger || host?.dataset.dsBusy === "1") return;
    if (host) host.dataset.dsBusy = "1";

    try {
      const opened = await openNativeMenu(trigger);
      if (!opened) {
        DS.setQuickStatus?.(`Could not open SpicyChat's ${actionLabel} menu.`);
        return;
      }

      const target = await waitFor(() =>
        DS.qsa(`button[aria-label="${actionLabel}"]`).find(isVisible),
      900, 35);

      if (!target) {
        DS.setQuickStatus?.(`${actionLabel} was not found in SpicyChat's menu.`);
        return;
      }

      try { target.click(); } catch { DS.realClick?.(target); }
    } finally {
      setTimeout(() => {
        if (host?.isConnected) delete host.dataset.dsBusy;
      }, 300);
    }
  }

  function decorateCard(trigger) {
    const found = findCard(trigger);
    if (!found) return;

    const { card, chatLink } = found;
    const signature = chatLink.href;
    card.classList.add("ds-saved-chat-card-with-actions");

    let host = card.querySelector(":scope > .ds-saved-chat-quick-actions");
    if (host?.dataset.dsChatHref === signature) return;
    host?.remove();

    host = document.createElement("div");
    host.className = "ds-saved-chat-quick-actions";
    host.dataset.dsChatHref = signature;
    host.setAttribute("aria-label", "Saved conversation quick actions");

    for (const action of ACTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `ds-saved-chat-quick-action ${action.className}`.trim();
      button.setAttribute("aria-label", `QoL ${action.label}`);
      button.title = action.label;
      button.textContent = action.icon;

      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        invokeNativeAction(trigger, action.label, host).catch(error => {
          delete host.dataset.dsBusy;
          DS.setQuickStatus?.(`${action.label} failed: ${error?.message || error}`);
        });
      }, true);

      host.appendChild(button);
    }

    card.appendChild(host);
  }

  function cleanup() {
    DS.qsa(".ds-saved-chat-quick-actions").forEach(el => el.remove());
    DS.qsa(".ds-saved-chat-card-with-actions").forEach(card => {
      card.classList.remove("ds-saved-chat-card-with-actions");
    });
  }

  DS.applySavedChatQuickActions = function applySavedChatQuickActions() {
    const settings = DS.state?.settings || {};

    if (!settings.enabled || !settings.showSavedChatQuickActions || !isSavedConversationPage()) {
      cleanup();
      return;
    }

    for (const trigger of DS.qsa('button[aria-label="EllipsisVertical-button"]')) {
      if (trigger.closest("#ds-qol-panel")) continue;
      decorateCard(trigger);
    }
  };
})();
