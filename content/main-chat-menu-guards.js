// Main runtime support: chat menu guards.
// Factories register functions but do not start observers until the main runtime is active.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  DS.createMainChatMenuGuards = function createMainChatMenuGuards({
    pauseReruns, scheduleChatHistoryBatchRefresh, prepareEditedMessageForSave
  }) {
    let lastChatDropdownClick = 0;
    function isVisible(el) {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    }

    function normalizedText(el) {
      const text = String(el?.getAttribute?.("aria-label") || el?.textContent || "");
      return DS.normalize ? DS.normalize(text) : text.toLowerCase().replace(/\s+/g, " ").trim();
    }

    function isLoadPreviousMessagesButton(button) {
      if (!(button instanceof Element)) return false;
      if (button.querySelector?.("[data-translate-key='chat:page.action.loadPreviousMessages']")) return true;
      return normalizedText(button).includes("load previous messages");
    }

    function isChatDropdownMenuElement(el) {
      if (!el || el.closest?.("#ds-qol-panel, #ds-chat-export-modal")) return false;
      if (!isVisible(el)) return false;

      const buttons = DS.qsa?.("button", el) || [];
      if (!buttons.length) return false;

      const labels = buttons.map(normalizedText).filter(Boolean);

      return labels.some(text => (
        text.includes("start new chat") ||
        text.includes("share chatbot") ||
        text.includes("view saved chats") ||
        text.includes("change persona") ||
        text.includes("generation settings") ||
        text.includes("block creator") ||
        text.includes("disable memory") ||
        text.includes("enable memory")
      ));
    }

    DS.isChatHeaderMenuOpen = function isChatHeaderMenuOpen() {
      if (!DS.isSingleChatPage?.()) return false;
      const button = DS.qs?.("button[aria-label='chat-dropdown']");

      if (button && isVisible(button)) {
        const expanded = button.getAttribute("aria-expanded") === "true" || button.dataset.state === "open";
        const justClicked = Date.now() - lastChatDropdownClick < 1500;

        if (expanded || justClicked) return true;
      }

      return (DS.qsa?.("[role='menu'], [role='dialog'], div.absolute, div.fixed") || [])
        .some(isChatDropdownMenuElement);
    };

    function rerunAfterMenuSettles() {
      clearTimeout(DS.state.chatHeaderMenuTimer);
      DS.state.chatHeaderMenuTimer = setTimeout(() => {
        DS.scheduleRun?.({ priority: "critical", source: "chat-menu" });
        DS.scheduleRun?.({ priority: "slow", source: "chat-menu" });
      }, 900);
    }


    let installed = false;
    function installChatMenuGuards() {
      if (installed || DS.isQolPausedForTab?.()) return;
      installed = true;
      document.addEventListener("pointerdown", event => {
        if (DS.state?.settings?.enabled === false || !DS.isSingleChatPage?.()) return;
        const target = event.target;
        const dropdownButton = target?.closest?.("button[aria-label='chat-dropdown']");
        const dropdownAction = target?.closest?.("button");
        const label = normalizedText(dropdownAction);

        if (isLoadPreviousMessagesButton(dropdownAction)) {
          scheduleChatHistoryBatchRefresh();
          return;
        }

        if (dropdownAction && label === "save") {
          const messageRoot = dropdownAction.closest?.("div[id^='message-']");
          const editing = messageRoot?.querySelector?.("textarea, [contenteditable='true']");
          if (messageRoot && editing) prepareEditedMessageForSave(messageRoot, "save");
        }

        if (dropdownButton) {
          lastChatDropdownClick = Date.now();
          pauseReruns(3500);
          return;
        }

        if (
          label.includes("start new chat") ||
          label.includes("view saved chats") ||
          label.includes("change persona") ||
          label.includes("generation settings") ||
          label.includes("share chatbot")
        ) {
          pauseReruns(7500);
        }
      }, true);

      document.addEventListener("click", event => {
        if (DS.state?.settings?.enabled === false || !DS.isSingleChatPage?.()) return;
        const button = event.target?.closest?.("button");
        const label = normalizedText(button);

        if (
          label.includes("start new chat") ||
          label.includes("view saved chats") ||
          label.includes("change persona") ||
          label.includes("generation settings") ||
          label.includes("share chatbot")
        ) {
          pauseReruns(7500);
        }
      }, true);
    }
    return Object.freeze({ rerunAfterMenuSettles, installChatMenuGuards });
  };

})();
}
