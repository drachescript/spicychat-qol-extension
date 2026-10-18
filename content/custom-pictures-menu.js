// Custom Pictures menu and lifecycle; feature-specific panels are registered separately.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  const kit = DS?.customPictureKit;
  if (!kit) return;
  let currentTab = "backgrounds";
  async function openMenu(requestedTab) {
    kit.close();
    if (!DS.isSingleChatPage?.()) return false;
    await kit.loadStore();
    const tabs = kit.availableTabs();
    if (!tabs.length) return false;
    if (requestedTab && tabs.some(tab => tab.id === requestedTab)) currentTab = requestedTab;
    if (!tabs.some(tab => tab.id === currentTab)) currentTab = tabs[0].id;
    const modal = document.createElement("div"); modal.id = "ds-chat-background-dialog"; modal.className = "ds-chat-background-dialog";
    const backdrop = document.createElement("div"); backdrop.className = "ds-chat-background-backdrop";
    const panel = document.createElement("div"); panel.className = "ds-chat-background-panel";
    panel.setAttribute("role","dialog"); panel.setAttribute("aria-modal","true");
    panel.setAttribute("aria-label","Custom Pictures");
    const navigation = document.createElement("div"); navigation.className = "ds-chat-background-actions";
    navigation.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px";
    for (const tab of tabs) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = tab.label;
      button.setAttribute("aria-pressed",tab.id===currentTab ? "true":"false");
      button.addEventListener("click", () => { currentTab = tab.id; void openMenu(currentTab); });
      navigation.append(button);
    }
    panel.append(navigation);
    const selected = tabs.find(tab => tab.id === currentTab);
    const body = document.createElement("section"); body.dataset.dsPictureTab = selected.id;
    selected.render(body);
    panel.append(body);
    const close = document.createElement("button"); close.type = "button"; close.textContent = "Close Custom Pictures";
    close.addEventListener("click",kit.close); panel.append(close);
    modal.append(backdrop,panel); document.documentElement.append(modal);
    backdrop.addEventListener("click",kit.close);
    return true;
  }
  DS.openCustomPicturesMenu = openMenu;
  DS.hasCustomPictures = () => kit.availableTabs().length > 0;
  DS.applyChatBackgrounds = async () => {
    const settings=DS.state?.settings || {};
    const active=!!(settings.enabled && DS.isSingleChatPage?.() && kit.availableTabs(settings).length);
    if (!active) { DS.removeChatBackgrounds?.(); return; }
    await kit.loadStore();
    await DS.applyBackgroundLayer?.(!!settings.enableChatBackgrounds && kit.isInstalled("chat-backgrounds"));
    for (const apply of kit.applyHooks()) apply();
    DS.state.chatBackgroundsWasActive=true;
  };
  DS.removeChatBackgrounds = () => {
    DS.removeBackgroundLayer?.();
    DS.removeCharacterPictureOverride?.();
    DS.removePersonaPictureOverride?.();
    kit.close();
    if (DS.state) DS.state.chatBackgroundsWasActive=false;
  };
  try {
    chrome.runtime?.onMessage?.addListener((message,_sender,sendResponse) => {
      if (message?.type !== "DS_GET_CHAT_BACKGROUND_MENU_STATE" && message?.type !== "DS_OPEN_CHAT_BACKGROUND_MENU") return false;
      const available=!!(DS.state?.settings?.enabled && DS.isSingleChatPage?.() && kit.availableTabs().length);
      sendResponse({ok:available});
      if (available && message.type==="DS_OPEN_CHAT_BACKGROUND_MENU") openMenu().catch(() => DS.setQuickStatus?.("Could not open Custom Pictures."));
      return false;
    });
  } catch {}
})();
}
