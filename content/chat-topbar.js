(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function unhideReason(reason) {
    DS.qsa(`[data-ds-reason='chat-topbar:${reason}']`).forEach(el => {
      DS.unhideElement?.(el);
    });
  }

  function hideElement(el, reason) {
    if (el) DS.hideElement?.(el, `chat-topbar:${reason}`);
  }

  function getBotProfileAnchor() {
    return document.querySelector("a[aria-label='chatbot-profile'][href*='/chatbot/']");
  }

  function getCreatorAnchor() {
    return document.querySelector("a[aria-label='creator-profile'][href*='/creator/']");
  }

  function getChatDropdownButton() {
    return document.querySelector("button[aria-label='chat-dropdown']");
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect?.();
    if (rect && (!rect.width || !rect.height)) return false;

    try {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return false;
      }
    } catch {}

    return true;
  }

  function compactChatHeader() {
    try { return window.matchMedia?.("(max-width: 700px)")?.matches ?? window.innerWidth <= 700; }
    catch { return window.innerWidth <= 700; }
  }

  function getTitleActionsContainer(host, profile) {
    if (!host || !profile) return null;

    let actions = host.querySelector(":scope > .ds-chat-title-buttons");
    if (!actions) {
      actions = document.createElement("span");
      actions.className = "ds-chat-title-buttons";
      profile.insertAdjacentElement("afterend", actions);
    }

    return actions;
  }

  function cleanupEmptyTitleActions() {
    DS.qsa(".ds-chat-title-buttons").forEach(actions => {
      if (!actions.children.length) actions.remove();
    });

    DS.qsa(".ds-chat-title-actions-host").forEach(host => {
      const hasActions = !!host.querySelector(":scope > .ds-chat-title-buttons");
      if (!hasActions) host.classList.remove("ds-chat-title-actions-host");
    });
  }

  async function clickNativeChatMenuAction(label) {
    const normalizedWanted = DS.normalize ? DS.normalize(label) : String(label || "").toLowerCase();

    const findAction = () => DS.qsa("button")
      .find(button => {
        if (!isVisible(button)) return false;
        const raw = button.getAttribute("aria-label") || button.textContent || "";
        const normalized = DS.normalize ? DS.normalize(raw) : String(raw).toLowerCase().trim();
        return normalized === normalizedWanted;
      });

    let action = findAction();

    if (!action) {
      const dropdown = getChatDropdownButton();
      if (!dropdown || !isVisible(dropdown)) {
        DS.setQuickStatus?.("Chat menu is not available yet.");
        return false;
      }

      DS.realClick?.(dropdown);

      for (let i = 0; i < 16 && !action; i++) {
        await DS.sleep?.(70);
        action = findAction();
      }
    }

    if (!action) {
      DS.setQuickStatus?.(`Could not find ${label}.`);
      return false;
    }

    DS.realClick?.(action);
    return true;
  }

  function findChatHeaderRoot() {
    const profile = getBotProfileAnchor();
    const dropdown = getChatDropdownButton();
    const start = profile || dropdown;

    if (!start) return null;

    let node = start;
    for (let i = 0; node && i < 12; i++, node = node.parentElement) {
      if (node === document.body || node.id === "root") break;

      const hasProfile = !!node.querySelector?.("a[aria-label='chatbot-profile']");
      const hasDropdown = !!node.querySelector?.("button[aria-label='chat-dropdown']");
      const hasControls = !!node.querySelector?.("button[aria-label='ThumbsUp-button'], [data-testid='ChatModelTierCapabilityGate']");

      if (hasProfile && hasDropdown && hasControls) return node;
    }

    return null;
  }

  function getCurrentBotId() {
    return DS.chatIdFromHref?.(location.href || "") || "";
  }

  function getCurrentBotName() {
    const profile = getBotProfileAnchor();
    const text = cleanText(profile?.querySelector?.("h1")?.textContent || profile?.textContent);

    return text || DS.getCurrentBotName?.() || "";
  }

  function getCurrentBotImage() {
    const header = findChatHeaderRoot();
    const img = header?.querySelector?.("img");

    return img?.currentSrc || img?.src || "";
  }

  function normalizeLaterStore() {
    const store = DS.state.laterBots || { ids: [], meta: {} };
    store.ids = Array.isArray(store.ids) ? store.ids : [];
    store.meta = store.meta && typeof store.meta === "object" ? store.meta : {};
    DS.state.laterBots = store;
    return store;
  }

  function isLaterSaved(id) {
    return !!id && !!DS.state.laterBotIdSet?.has(id);
  }

  function updateLaterButton(button, id) {
    const saved = isLaterSaved(id);
    const selected = saved ? "1" : "0";
    const text = saved ? "Later ✓" : "Later";
    const title = saved ? "Remove from Later" : "Save for later";

    DS.setDatasetIfChanged?.(button, "dsSaved", selected);
    DS.setTextIfChanged?.(button, text);
    if (button.title !== title) button.title = title;
    DS.setAttributeIfChanged?.(button, "aria-label", title);
  }

  function requestCurrentTabClose() {
    try {
      chrome.runtime.sendMessage({ type: "DS_CLOSE_CURRENT_TAB" }, () => {
        void chrome.runtime.lastError;
      });
    } catch {}
  }

  async function toggleCurrentBotLater(button) {
    const id = button.dataset.dsBotId || getCurrentBotId();
    if (!id) return;

    const store = normalizeLaterStore();
    const wasSaved = !!DS.state.laterBotIdSet?.has(id);

    if (wasSaved) {
      store.ids = store.ids.filter(item => item !== id);
      DS.state.laterBotIdSet?.delete(id);
      delete store.meta[id];
      DS.setQuickStatus?.("Removed from Later.");
    } else {
      store.ids.push(id);
      DS.state.laterBotIdSet?.add(id);
      store.meta[id] = {
        ...(store.meta[id] || {}),
        id,
        name: getCurrentBotName() || id,
        image: getCurrentBotImage(),
        chatUrl: `${location.origin}/chat/${id}`,
        profileUrl: `${location.origin}/chatbot/${id}`,
        savedAt: Date.now()
      };
      DS.setQuickStatus?.(`Saved for later: ${store.meta[id].name || "bot"}`);
    }

    await DS.saveLaterBots?.(store);
    updateLaterButton(button, id);
    DS.updateLaterBotButtons?.();
    DS.updateQuickPanel?.();

    if (!wasSaved && DS.state.settings?.closeChatTabAfterSavingLater) {
      setTimeout(requestCurrentTabClose, 120);
    }
  }

  function cleanupLaterButton() {
    DS.qsa(".ds-chat-topbar-later-button").forEach(button => button.remove());
    cleanupEmptyTitleActions();
  }

  function cleanupChatHistoryButtons() {
    DS.qsa(".ds-chat-history-button, .ds-chat-new-chat-button, .ds-chat-profile-button").forEach(button => button.remove());
    cleanupEmptyTitleActions();
  }

  function applyHeaderLaterButton() {
    const settings = DS.state.settings || {};
    const profile = getBotProfileAnchor();
    const host = profile?.parentElement;
    const id = getCurrentBotId();

    if (!host || !profile || !id || !settings.chatTopBarAddLaterButton) {
      cleanupLaterButton();
      return;
    }

    DS.qsa(".ds-chat-title-actions-host").forEach(otherHost => {
      if (otherHost !== host && !otherHost.querySelector(":scope > .ds-chat-title-buttons")) {
        otherHost.classList.remove("ds-chat-title-actions-host");
      }
    });
    DS.setClassState?.(host, "ds-chat-title-actions-host", true);

    const actions = getTitleActionsContainer(host, profile);
    if (!actions) return;

    let button = document.querySelector(".ds-chat-topbar-later-button");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "ds-chat-topbar-later-button";
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggleCurrentBotLater(button);
      }, true);
    }

    if (button.parentElement !== actions) {
      actions.appendChild(button);
    }

    button.dataset.dsBotId = id;
    updateLaterButton(button, id);
  }

  function applyPerCharacterChatHistoryButtons() {
    const settings = DS.state.settings || {};
    const profile = getBotProfileAnchor();
    const host = profile?.parentElement;

    if (!profile || !host) {
      cleanupChatHistoryButtons();
      return;
    }

    const wantsHistory = !!settings.showPerCharacterChatHistory;
    const wantsNewChat = !!settings.showQuickNewChatButton;
    // On narrow screens the character name can be heavily truncated by native
    // and QoL controls. Keep an explicit Profile shortcut in the same stable
    // action row whenever Chat Top Bar tools are active so the profile remains
    // reachable even when there is very little title space.
    const wantsProfile = compactChatHeader();

    if (!wantsHistory && !wantsNewChat && !wantsProfile) {
      cleanupChatHistoryButtons();
      return;
    }

    DS.setClassState?.(host, "ds-chat-title-actions-host", true);
    const actions = getTitleActionsContainer(host, profile);
    if (!actions) return;

    let profileButton = actions.querySelector(".ds-chat-profile-button");
    if (wantsProfile) {
      if (!profileButton) {
        profileButton = document.createElement("button");
        profileButton.type = "button";
        profileButton.className = "ds-chat-title-mini-button ds-chat-profile-button";
        profileButton.textContent = "Profile";
        profileButton.title = "Open this character's profile";
        profileButton.setAttribute("aria-label", profileButton.title);
        profileButton.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          const href = getBotProfileAnchor()?.href || `${location.origin}/chatbot/${getCurrentBotId()}`;
          if (href) location.assign(href);
        }, true);
        actions.appendChild(profileButton);
      }
    } else {
      profileButton?.remove();
    }

    let historyButton = actions.querySelector(".ds-chat-history-button");
    if (wantsHistory) {
      if (!historyButton) {
        historyButton = document.createElement("button");
        historyButton.type = "button";
        historyButton.className = "ds-chat-title-mini-button ds-chat-history-button";
        historyButton.textContent = "Chats";
        historyButton.title = "View saved chats for this character";
        historyButton.setAttribute("aria-label", historyButton.title);
        historyButton.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          clickNativeChatMenuAction("View Saved Chats");
        }, true);
        actions.appendChild(historyButton);
      }
    } else {
      historyButton?.remove();
    }

    let newChatButton = actions.querySelector(".ds-chat-new-chat-button");
    if (wantsNewChat) {
      if (!newChatButton) {
        newChatButton = document.createElement("button");
        newChatButton.type = "button";
        newChatButton.className = "ds-chat-title-mini-button ds-chat-new-chat-button";
        newChatButton.textContent = "+";
        newChatButton.title = "Start another chat with this character";
        newChatButton.setAttribute("aria-label", newChatButton.title);
        newChatButton.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          clickNativeChatMenuAction("Start New Chat");
        }, true);
        actions.appendChild(newChatButton);
      }
    } else {
      newChatButton?.remove();
    }

    cleanupEmptyTitleActions();
  }

  function applyInlineCreator() {
    const settings = DS.state.settings || {};
    const creator = getCreatorAnchor();
    const host = creator?.parentElement;

    DS.qsa(".ds-chat-topbar-creator-line").forEach(el => {
      if (el !== host) el.classList.remove("ds-chat-topbar-creator-line");
    });

    if (!settings.chatTopBarInlineCreator || !host) {
      host?.classList?.remove("ds-chat-topbar-creator-line");
      return;
    }

    host.classList.add("ds-chat-topbar-creator-line");
  }

  function hideHeaderControls() {
    const settings = DS.state.settings || {};
    const header = findChatHeaderRoot();

    const context = header?.querySelector?.("[data-testid='ContextCapIndicator']");
    if (settings.hideChatTopBarContextDot) {
      hideElement(context, "context-dot");
    } else {
      unhideReason("context-dot");
    }

    const rating = header?.querySelector?.("button[aria-label='ThumbsUp-button']");
    if (settings.hideChatTopBarRatingButton) {
      hideElement(rating, "rating-button");
    } else {
      unhideReason("rating-button");
    }

    const model = header?.querySelector?.("[data-testid='ChatModelTierCapabilityGate']");
    if (settings.hideChatTopBarModelButton) {
      hideElement(model, "model-button");
    } else {
      unhideReason("model-button");
    }
  }

  function applyMenuCleanup() {
    const settings = DS.state.settings || {};

    DS.qsa("button").forEach(button => {
      const text = cleanText(button.getAttribute("aria-label") || button.textContent);
      const normalized = DS.normalize ? DS.normalize(text) : text.toLowerCase();

      if (
        (settings.hideChatDropdownVoiceUpsell || settings.hideUnlockCustomVoices) &&
        normalized === "unlock custom voices"
      ) {
        hideElement(button, "menu-voice-upsell");
        return;
      }

      if (
        settings.hideChatDropdownMemoryItem &&
        (normalized === "disable memory" || normalized === "enable memory")
      ) {
        hideElement(button, "menu-memory");
      }
    });

    if (!settings.hideChatDropdownVoiceUpsell && !settings.hideUnlockCustomVoices) {
      unhideReason("menu-voice-upsell");
    }

    if (!settings.hideChatDropdownMemoryItem) {
      unhideReason("menu-memory");
    }
  }

  function cleanupTopBarTools() {
    DS.qsa(".ds-chat-topbar-creator-line").forEach(el => {
      el.classList.remove("ds-chat-topbar-creator-line");
    });
    unhideReason("context-dot");
    unhideReason("rating-button");
    unhideReason("model-button");
    unhideReason("menu-voice-upsell");
    unhideReason("menu-memory");
  }

  DS.applyChatTopBarTools = function applyChatTopBarTools() {
    const settings = DS.state.settings || {};
    const onChat = !!settings.enabled && DS.isSingleChatPage?.();
    const hasTools = !!(
      settings.chatTopBarAddLaterButton ||
      settings.showPerCharacterChatHistory ||
      settings.showQuickNewChatButton ||
      settings.showChatTopBarTools
    );

    if (!onChat || !hasTools) {
      if (DS.state.chatTopBarWasActive) {
        cleanupLaterButton();
        cleanupChatHistoryButtons();
        cleanupTopBarTools();
      }
      DS.state.chatTopBarWasActive = false;
      return;
    }

    DS.state.chatTopBarWasActive = true;

    // These bot actions are independent from the optional chat-header cleanup group.
    applyHeaderLaterButton();
    applyPerCharacterChatHistoryButtons();

    if (!settings.showChatTopBarTools) {
      cleanupTopBarTools();
      return;
    }

    applyInlineCreator();
    hideHeaderControls();
    applyMenuCleanup();
  };
})();
