if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS || DS.__chatFormatCompatibilityLoaded) return;
  DS.__chatFormatCompatibilityLoaded = true;

  // Older builds wrapped raw text to correct inherited dialogue colors.
  // SpicyChat's native Chat Appearance now owns those colors. Keep a one-time
  // wrapper cleanup and remove any old fallback stylesheet, without adding
  // observers, per-message writes, or permanent event handlers.
  const STYLE_ID = "ds-native-dialogue-format-compatibility-style";
  const LEGACY_WRAPPER = "[data-ds-native-format-dialogue-fix='1']";

  function clearLegacyWrappers(root = document) {
    // Migrate old injected wrappers without inserting new formatting markup.
    root?.querySelectorAll?.(LEGACY_WRAPPER).forEach(node => {
      node.replaceWith(document.createTextNode(node.textContent || ""));
    });
  }

  function refresh() {
    // SpicyChat's native Chat Appearance now owns text colors, including
    // per-theme and user-selected dialogue colors. QoL's bubble feature has
    // its own strictly opt-in styles; a globally applied black/white fallback
    // conflicts even when the user explicitly disables QoL bubbles.
    document.getElementById(STYLE_ID)?.remove();
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
})();

}
