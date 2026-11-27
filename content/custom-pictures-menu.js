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
    const route = location.pathname;
    try { await kit.loadStore(lastRestoreStatus === "storage-unavailable"); }
    catch { DS.setQuickStatus?.("Could not load saved pictures. Try opening Custom Pictures again."); return false; }
    if (route !== location.pathname || !DS.isSingleChatPage?.()) return false;
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
  let initialApplyToken = 0;
  let initialApplyQueued = false;
  let initialApplyTimer = null;
  let lastAppliedRoute = '';
  let scheduledRefresh = null;
  let scheduledRunning = false;
  let scheduledAgain = false;
  let restoreTimer = null;
  let restoreAttempts = 0;
  let lastRestoreStatus = "";
  function cancelRestore(reset = false) {
    clearTimeout(restoreTimer); restoreTimer = null;
    if (reset) { restoreAttempts = 0; lastRestoreStatus = ""; }
  }
  function reportRestore(status) {
    if (lastRestoreStatus === status) return;
    lastRestoreStatus = status;
    DS.diagEvent?.("chat-backgrounds", "restore-state", { status });
  }
  function retryRestore(route, token) {
    if (restoreTimer !== null || restoreAttempts >= 3 || document.hidden) return;
    restoreTimer = setTimeout(() => {
      restoreTimer = null;
      if (route !== location.pathname || token !== initialApplyToken || document.hidden || !DS.state?.settings?.enabled) return;
      restoreAttempts++;
      DS.queueChatBackgroundRefresh();
    }, [500, 1500, 3500][restoreAttempts]);
  }
  const applyPicturesNow = async () => {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !DS.isSingleChatPage?.() || !kit.availableTabs(settings).length) return;
    const route = String(location.pathname || '');
    const token = initialApplyToken;
    try { await kit.loadStore(); }
    catch {
      if (route === location.pathname && token === initialApplyToken) {
        reportRestore("storage-unavailable"); retryRestore(route, token);
      }
      return;
    }
    const latest = DS.state?.settings || {};
    if (token !== initialApplyToken || !latest.enabled || !DS.isSingleChatPage?.() || location.pathname !== route || !kit.availableTabs(latest).length) return;
    const status = await DS.applyBackgroundLayer?.(!!latest.enableChatBackgrounds && kit.isInstalled("chat-backgrounds"));
    if (status) {
      reportRestore(status);
      if (status === "avatar-unavailable" || status === "waiting-for-body") retryRestore(route, token);
      else cancelRestore();
    } else if (latest.enableChatBackgrounds && kit.isInstalled("chat-backgrounds")) reportRestore("module-unavailable");
    if (token !== initialApplyToken || location.pathname !== route || !DS.state?.settings?.enabled) return;
    const hooks = () => { for (const apply of kit.applyHooks()) apply(); };
    if (DS.pictureOverrideCore?.withSharedRoots) DS.pictureOverrideCore.withSharedRoots(hooks);
    else hooks();
    DS.state.chatBackgroundsWasActive = true;
  };
  DS.applyChatBackgrounds = async () => {
    const settings=DS.state?.settings || {};
    const active=!!(settings.enabled && DS.isSingleChatPage?.() && kit.availableTabs(settings).length);
    if (!active) { DS.removeChatBackgrounds?.(); return; }
    // Make a newly visited chat interactive before loading potentially large saved pictures.
    const route = String(location.pathname || '');
    if (lastAppliedRoute !== route) {
      cancelRestore(true);
      clearTimeout(initialApplyTimer);
      initialApplyTimer = null;
      initialApplyQueued = false;
      // A previous chat's picture must not remain behind the next chat.
      DS.removeBackgroundLayer?.();
      lastAppliedRoute = route;
      initialApplyQueued = true;
      const token = ++initialApplyToken;
      initialApplyTimer = setTimeout(() => {
        if (token !== initialApplyToken || location.pathname !== route) return;
        initialApplyTimer = null;
        initialApplyQueued = false;
        DS.queueChatBackgroundRefresh();
      }, 150);
      return;
    }
    if (initialApplyQueued) return;
    await applyPicturesNow();
  };
  // Critical scheduler only queues this work. User actions may still await
  // applyChatBackgrounds directly; no image work is added to message lanes.
  DS.queueChatBackgroundRefresh = () => {
    if (scheduledRefresh !== null) return;
    if (scheduledRunning) { scheduledAgain = true; return; }
    scheduledRefresh = setTimeout(async () => {
      scheduledRefresh = null;
      scheduledRunning = true;
      const started = performance.now();
      const token = DS.diagOperationStart?.("chat-backgrounds", "deferred-refresh", { phase: "outside-critical-scheduler" });
      let outcome = "ok";
      try { await DS.applyChatBackgrounds(); }
      catch { outcome = "error"; }
      finally {
        scheduledRunning = false;
        DS.diagOperationEnd?.(token, { outcome, meta: { wallMs: performance.now() - started, timingKind: "async-wall-not-cpu" } });
        if (scheduledAgain) { scheduledAgain = false; DS.queueChatBackgroundRefresh(); }
      }
    }, 0);
  };
  DS.removeChatBackgrounds = () => {
    cancelRestore(true);
    clearTimeout(scheduledRefresh);
    scheduledRefresh = null;
    scheduledAgain = false;
    ++initialApplyToken;
    clearTimeout(initialApplyTimer);
    initialApplyTimer = null;
    initialApplyQueued = false;
    lastAppliedRoute = '';
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
