(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const ROOT_ATTR = "data-ds-chat-bubbles";
  const AI_SHAPE_ATTR = "data-ds-chat-bubble-ai-shape";
  const USER_SHAPE_ATTR = "data-ds-chat-bubble-user-shape";
  const AI_TEXT_MODE_ATTR = "data-ds-chat-bubble-ai-text-mode";
  const USER_TEXT_MODE_ATTR = "data-ds-chat-bubble-user-text-mode";
  const AI_ACTION_MODE_ATTR = "data-ds-chat-bubble-ai-action-mode";
  const USER_ACTION_MODE_ATTR = "data-ds-chat-bubble-user-action-mode";
  const AI_DIALOGUE_MODE_ATTR = "data-ds-chat-bubble-ai-dialogue-mode";
  const USER_DIALOGUE_MODE_ATTR = "data-ds-chat-bubble-user-dialogue-mode";
  const AI_CAT_LAYOUT_ATTR = "data-ds-chat-bubble-ai-cat-layout";
  const USER_CAT_LAYOUT_ATTR = "data-ds-chat-bubble-user-cat-layout";
  const VALID_SHAPES = new Set(["native", "rounded", "square", "speech", "cat", "cloud"]);
  const VALID_TEXT_MODES = new Set(["native", "custom"]);
  const VALID_SEGMENT_MODES = new Set(["native", "base", "custom"]);
  const VALID_DECORATION_MODES = new Set(["bubble", "custom"]);
  const VALID_CAT_LAYOUTS = new Set(["auto", "left", "right", "split"]);
  const VALID_BORDER_STYLES = new Set(["solid", "dashed", "dotted", "double"]);

  function clamp(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function normalizeHex(value, fallback) {
    const text = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
  }

  function hexToRgba(hex, opacity, minOpacity = 30) {
    const value = normalizeHex(hex, "#000000").slice(1);
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    const a = clamp(opacity, minOpacity, 100, 100) / 100;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  function normalizedShape(value) {
    const shape = String(value || "native").toLowerCase();
    return VALID_SHAPES.has(shape) ? shape : "native";
  }

  function normalizedTextMode(value) {
    return VALID_TEXT_MODES.has(value) ? value : "custom";
  }

  function normalizedDecorationMode(value) {
    return VALID_DECORATION_MODES.has(value) ? value : "bubble";
  }

  function normalizedCatLayout(value) {
    return VALID_CAT_LAYOUTS.has(value) ? value : "auto";
  }

  function normalizedBorderStyle(value) {
    return VALID_BORDER_STYLES.has(value) ? value : "solid";
  }

  function normalizedSegmentMode(value, fallback) {
    return VALID_SEGMENT_MODES.has(value) ? value : fallback;
  }

  function actionMode(settings, prefix) {
    const explicit = settings[`${prefix}ActionMode`];
    if (VALID_SEGMENT_MODES.has(explicit)) return explicit;
    // Backward compatibility with the pre-.92 all-actions toggle.
    return settings.chatBubblePreserveActionColors === false ? "base" : "native";
  }

  function applyRootVariables(settings) {
    const root = document.documentElement;

    root.style.setProperty("--ds-chat-bubble-ai-bg", hexToRgba(settings.chatBubbleAiBackground || "#27282d", settings.chatBubbleAiOpacity));
    root.style.setProperty("--ds-chat-bubble-ai-text", normalizeHex(settings.chatBubbleAiText, "#f2f2f2"));
    root.style.setProperty("--ds-chat-bubble-ai-action-text", normalizeHex(settings.chatBubbleAiActionText, "#79c8f5"));
    root.style.setProperty("--ds-chat-bubble-ai-dialogue-text", normalizeHex(settings.chatBubbleAiDialogueText, "#f2f2f2"));
    root.style.setProperty("--ds-chat-bubble-ai-border", hexToRgba(settings.chatBubbleAiBorder || "#555861", settings.chatBubbleAiBorderOpacity, 0));
    root.style.setProperty("--ds-chat-bubble-ai-border-width", `${clamp(settings.chatBubbleAiBorderWidth, 0, 12, 0)}px`);
    root.style.setProperty("--ds-chat-bubble-ai-border-style", normalizedBorderStyle(settings.chatBubbleAiBorderStyle));
    root.style.setProperty("--ds-chat-bubble-ai-radius", `${clamp(settings.chatBubbleAiRadius, 4, 40, 20)}px`);
    const aiDecorationMode = normalizedDecorationMode(settings.chatBubbleAiDecorationMode);
    root.style.setProperty("--ds-chat-bubble-ai-decoration", aiDecorationMode === "custom"
      ? hexToRgba(settings.chatBubbleAiDecorationColor || settings.chatBubbleAiBackground || "#27282d", settings.chatBubbleAiOpacity)
      : hexToRgba(settings.chatBubbleAiBackground || "#27282d", settings.chatBubbleAiOpacity));
    root.style.setProperty("--ds-chat-bubble-ai-shadow", settings.chatBubbleAiShadow ? "0 6px 18px rgba(0,0,0,.28)" : "none");

    root.style.setProperty("--ds-chat-bubble-user-bg", hexToRgba(settings.chatBubbleUserBackground || "#253f52", settings.chatBubbleUserOpacity));
    root.style.setProperty("--ds-chat-bubble-user-text", normalizeHex(settings.chatBubbleUserText, "#f5f5f5"));
    root.style.setProperty("--ds-chat-bubble-user-action-text", normalizeHex(settings.chatBubbleUserActionText, "#79c8f5"));
    root.style.setProperty("--ds-chat-bubble-user-dialogue-text", normalizeHex(settings.chatBubbleUserDialogueText, "#f5f5f5"));
    root.style.setProperty("--ds-chat-bubble-user-border", hexToRgba(settings.chatBubbleUserBorder || "#52718a", settings.chatBubbleUserBorderOpacity, 0));
    root.style.setProperty("--ds-chat-bubble-user-border-width", `${clamp(settings.chatBubbleUserBorderWidth, 0, 12, 0)}px`);
    root.style.setProperty("--ds-chat-bubble-user-border-style", normalizedBorderStyle(settings.chatBubbleUserBorderStyle));
    root.style.setProperty("--ds-chat-bubble-user-radius", `${clamp(settings.chatBubbleUserRadius, 4, 40, 20)}px`);
    const userDecorationMode = normalizedDecorationMode(settings.chatBubbleUserDecorationMode);
    root.style.setProperty("--ds-chat-bubble-user-decoration", userDecorationMode === "custom"
      ? hexToRgba(settings.chatBubbleUserDecorationColor || settings.chatBubbleUserBackground || "#253f52", settings.chatBubbleUserOpacity)
      : hexToRgba(settings.chatBubbleUserBackground || "#253f52", settings.chatBubbleUserOpacity));
    root.style.setProperty("--ds-chat-bubble-user-shadow", settings.chatBubbleUserShadow ? "0 6px 18px rgba(0,0,0,.28)" : "none");

    root.setAttribute(ROOT_ATTR, "1");
    root.setAttribute(AI_SHAPE_ATTR, normalizedShape(settings.chatBubbleAiShape));
    root.setAttribute(USER_SHAPE_ATTR, normalizedShape(settings.chatBubbleUserShape));
    root.setAttribute(AI_TEXT_MODE_ATTR, normalizedTextMode(settings.chatBubbleAiTextMode));
    root.setAttribute(USER_TEXT_MODE_ATTR, normalizedTextMode(settings.chatBubbleUserTextMode));
    root.setAttribute(AI_ACTION_MODE_ATTR, actionMode(settings, "chatBubbleAi"));
    root.setAttribute(USER_ACTION_MODE_ATTR, actionMode(settings, "chatBubbleUser"));
    root.setAttribute(AI_DIALOGUE_MODE_ATTR, normalizedSegmentMode(settings.chatBubbleAiDialogueMode, "base"));
    root.setAttribute(USER_DIALOGUE_MODE_ATTR, normalizedSegmentMode(settings.chatBubbleUserDialogueMode, "base"));
    root.setAttribute(AI_CAT_LAYOUT_ATTR, normalizedCatLayout(settings.chatBubbleAiCatEarLayout));
    root.setAttribute(USER_CAT_LAYOUT_ATTR, normalizedCatLayout(settings.chatBubbleUserCatEarLayout));
  }

  function cleanup() {
    const root = document.documentElement;
    [
      ROOT_ATTR, AI_SHAPE_ATTR, USER_SHAPE_ATTR,
      AI_TEXT_MODE_ATTR, USER_TEXT_MODE_ATTR,
      AI_ACTION_MODE_ATTR, USER_ACTION_MODE_ATTR,
      AI_DIALOGUE_MODE_ATTR, USER_DIALOGUE_MODE_ATTR,
      AI_CAT_LAYOUT_ATTR, USER_CAT_LAYOUT_ATTR,
      "data-ds-chat-bubble-action-colors"
    ].forEach(attr => root.removeAttribute(attr));

    [
      "--ds-chat-bubble-ai-bg", "--ds-chat-bubble-ai-text", "--ds-chat-bubble-ai-action-text", "--ds-chat-bubble-ai-dialogue-text",
      "--ds-chat-bubble-ai-border", "--ds-chat-bubble-ai-border-width", "--ds-chat-bubble-ai-border-style", "--ds-chat-bubble-ai-radius", "--ds-chat-bubble-ai-decoration", "--ds-chat-bubble-ai-shadow",
      "--ds-chat-bubble-user-bg", "--ds-chat-bubble-user-text", "--ds-chat-bubble-user-action-text", "--ds-chat-bubble-user-dialogue-text",
      "--ds-chat-bubble-user-border", "--ds-chat-bubble-user-border-width", "--ds-chat-bubble-user-border-style", "--ds-chat-bubble-user-radius", "--ds-chat-bubble-user-decoration", "--ds-chat-bubble-user-shadow"
    ].forEach(name => root.style.removeProperty(name));

    // Remove classes left by 0.1.8.81-.83 so an upgrade takes effect immediately.
    document.querySelectorAll(".ds-chat-bubble-customized, .ds-chat-bubble-ai, .ds-chat-bubble-user, .ds-chat-bubble-content").forEach(el => {
      el.classList.remove("ds-chat-bubble-customized", "ds-chat-bubble-ai", "ds-chat-bubble-user", "ds-chat-bubble-content");
      el.removeAttribute("data-ds-bubble-shape");
    });
    DS.state.chatBubbleCustomizationWasActive = false;
  }

  DS.applyChatBubbleCustomization = function applyChatBubbleCustomization() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enableChatBubbleCustomization || !DS.isSingleChatPage?.()) {
      if (DS.state.chatBubbleCustomizationWasActive || document.documentElement.hasAttribute(ROOT_ATTR)) cleanup();
      return;
    }

    DS.state.chatBubbleCustomizationWasActive = true;
    applyRootVariables(settings);
  };

  DS.removeChatBubbleCustomization = cleanup;
})();
