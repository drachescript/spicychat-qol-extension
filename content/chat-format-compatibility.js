(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS || DS.__chatFormatCompatibilityLoaded) return;
  DS.__chatFormatCompatibilityLoaded = true;

  // This compatibility layer used to replace every raw text node with a span.
  // On a React-rendered chat that became a repeat unwrap/wrap feedback loop.
  // CSS corrects only the affected parent color; <em>, <i> and <q> keep their
  // own native SpicyChat styling. No MutationObserver or per-message writes.
  const STYLE_ID = "ds-native-dialogue-format-compatibility-style";
  const LEGACY_WRAPPER = "[data-ds-native-format-dialogue-fix='1']";

  function eligible() {
    return DS.state?.settings?.enabled !== false &&
      !!DS.isSingleChatPage?.() &&
      document.documentElement?.getAttribute("data-ds-chat-bubbles") !== "1";
  }

  function clearLegacyWrappers(root = document) {
    // One-time migration for live tabs that still have old injected wrappers.
    root?.querySelectorAll?.(LEGACY_WRAPPER).forEach(node => {
      node.replaceWith(document.createTextNode(node.textContent || ""));
    });
  }

  function refresh() {
    let style = document.getElementById(STYLE_ID);
    if (!eligible()) {
      style?.remove();
      return;
    }
    if (style) return;
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.dataset.dsOwned = "1";
    style.textContent = `
      /* Correct a leaked action-colored parent without rewriting chat text. */
      html:not(.dark):not([data-ds-chat-bubbles="1"])
        div[id^="message-"] span.leading-6:has(> em, > i),
      html:not(.dark):not([data-ds-chat-bubbles="1"])
        div[id^="message-"] span.leading-6[class*="text-sky-"]:has(> q) {
        color: #000 !important;
      }
      html.dark:not([data-ds-chat-bubbles="1"])
        div[id^="message-"] span.leading-6:has(> em, > i),
      html.dark:not([data-ds-chat-bubbles="1"])
        div[id^="message-"] span.leading-6[class*="text-sky-"]:has(> q) {
        color: #fff !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  DS.applyChatFormattingCompatibility = refresh;
  DS.prepareChatFormattingCompatibilityMessageForEdit = clearLegacyWrappers;
  // No observing mutations. Migrate old wrappers just once during startup.
  clearLegacyWrappers();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh, { once: true });
  } else {
    refresh();
  }
  window.addEventListener("popstate", () => setTimeout(refresh, 60), true);
  try {
    chrome.storage?.onChanged?.addListener?.((changes, area) => {
      if (area === "local" && DS.hasSettingStorageChanges?.(changes)) refresh();
    });
  } catch {}
})();
