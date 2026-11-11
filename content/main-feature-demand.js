// Stage 7: feature demand and route predicates. Evaluated only when the main
// scheduler asks; loading this module starts no observer, timer, or feature.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  function messageQuickActionsEnabled(settings = DS.state?.settings || {}) {
    return !!(
      settings.messageQuickActionCopy ||
      settings.messageQuickActionEdit ||
      settings.messageQuickActionRemoveImage ||
      settings.messageQuickActionResend ||
      settings.messageQuickActionReport ||
      settings.messageBottomMenuShortcut
    );
  }

  function deepSleepEnabled() {
    // A disabled feature is never scheduled. Old persisted opt-outs are ignored.
    return true;
  }

  function anySetting(settings, keys) {
    return keys.some(key => !!settings?.[key]);
  }

  function chatTopBarWanted(settings) {
    return anySetting(settings, [
      "showChatTopBarTools", "chatTopBarInlineCreator", "chatTopBarAddLaterButton",
      "showPerCharacterChatHistory", "showQuickNewChatButton", "chatAlwaysShowProfileLink",
      "chatJumpToStartShortcut", "chatOpenWindowShortcut", "chatGenerationSettingsShortcut", "showChatExportButton", "hideChatTopBarRatingButton",
      "hideChatTopBarModelButton", "hideChatTopBarContextDot", "hideChatDropdownVoiceUpsell",
      "hideChatDropdownMemoryItem"
    ]);
  }

  function composerWanted(settings) {
    return anySetting(settings, [
      "hideChatPlusButton", "hideChatImageButton", "replaceChatImageWithOocButton",
      "showAsteriskButton", "autoPairAsterisks", "hideChatVoiceButton", "hideUnlockCustomVoices"
    ]);
  }

  function chatUiWanted(settings) {
    return composerWanted(settings) || anySetting(settings, [
      "allowTypingWhileAiResponding", "keepChatPositionWhileTyping"
    ]);
  }

  function topBarWanted(settings) {
    return anySetting(settings, ["hideTopBarLanguage", "hideTopBarNotifications", "hideTopBarTheme"]) ||
      String(settings.topBarProfilePillMode || "normal") !== "normal" || !!settings.topBarProfilePillPersonaPrefix;
  }

  function notificationsWanted(settings) {
    return anySetting(settings, ["hideNotifications", "hideTabNotificationBadge", "autoReadNotifications", "hideFeatureReleasePopups"]);
  }

  function cardFilteringWanted(settings) {
    // Saved explicit bot IDs must remain hidden even when optional word/tag
    // filters are off. The dirty-card cache keeps repeated passes inexpensive.
    if (DS.state?.blockedBotIdSet?.size || document.querySelector('[data-ds-reason*="personality not public"]')) return true;
    return anySetting(settings, [
      "blockCards", "hideOpenedChats", "hideLaterBotsFromListings", "hideHomeForYouCards",
      "hideGroupChats", "enableLanguageFilter", "publicPersonalityOnly"
    ]);
  }

  function cardBlockUiWanted(settings) {
    return anySetting(settings, ["blockCards", "replaceCardProfileWithBlockButton", "showBlockButtonOnMyCreations", "enableBulkCardBlocking"]);
  }

  function modelSelectorWanted(settings) {
    return anySetting(settings, ["expandModelSelectorDescriptions", "hideModelUpgradeButtons", "customizeModelQuickMenu", "enableModelQuickAccess"]);
  }

  function generationMetadataWanted(settings) {
    return anySetting(settings, ["showGenerationMetadata", "showMessageTimestamps", "showGenerationModel", "showGenerationElapsed", "showGenerationSettings", "enableContextWindowWarning"]);
  }

  function personaToolsWanted(settings) {
    return /^\/personas\/?$/.test(location.pathname) || anySetting(settings, ["autoAcceptPersonaChange", "savePersonasFromPages", "keepLocalPersonaCopies", "expandPersonaDescriptions", "enablePersonaOrganizer", "showPersonaQuickSwitch"]);
  }

  function memoryManagerWanted(settings) {
    return anySetting(settings, ["enableBulkMemoryManager", "showCopyMemoryAction", "memoryAutoLoadAll"]);
  }

  function botEditorRoute() {
    return !!DS.getPageState?.().isBotEditor;
  }

  function lorebookEditorRoute() {
    return !!DS.getPageState?.().isLorebookEditor;
  }

  DS.mainFeatureDemand = Object.freeze({
    messageQuickActionsEnabled, deepSleepEnabled, anySetting,
    chatTopBarWanted, composerWanted, chatUiWanted, topBarWanted,
    notificationsWanted, cardFilteringWanted, cardBlockUiWanted,
    modelSelectorWanted, generationMetadataWanted, personaToolsWanted,
    memoryManagerWanted, botEditorRoute, lorebookEditorRoute
  });
})();
}
