(() => {
  "use strict";

  if (window.__SPICYCHAT_QOL_AUTO_AFK_V01849__) return;
  window.__SPICYCHAT_QOL_AUTO_AFK_V01849__ = true;

  const DS = window.DragonScriptQoL;
  let lastActivitySentAt = 0;
  let lastOpenSentAt = 0;

  function enabled() {
    return DS?.state?.settings?.autoAfkEnabled === true;
  }

  function pageIsActuallyVisible() {
    return document.visibilityState === "visible" && !document.hidden;
  }

  function sendActivity(reason, force = false) {
    if (!enabled()) return;

    // Background pages can receive lifecycle events without ever being shown.
    // Only visible/open events count as focus; hidden/blurred events are sent
    // deliberately to record when the user's focused period ended.
    if (reason === "opened" && !pageIsActuallyVisible()) return;

    const now = Date.now();
    const isOpenEvent = reason === "opened";
    const minGap = isOpenEvent ? 3000 : 30000;
    const previous = isOpenEvent ? lastOpenSentAt : lastActivitySentAt;

    if (!force && now - previous < minGap) return;
    if (isOpenEvent) lastOpenSentAt = now;
    else lastActivitySentAt = now;

    try {
      chrome.runtime.sendMessage({
        type: "DS_AUTO_AFK_ACTIVITY",
        reason
      }, () => void chrome.runtime.lastError);
    } catch {}
  }

  ["pointerdown", "keydown", "touchstart", "wheel"].forEach(type => {
    window.addEventListener(type, () => sendActivity("activity"), {
      capture: true,
      passive: true
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sendActivity("opened", true);
    else sendActivity("blurred", true);
  }, true);

  window.addEventListener("focus", () => sendActivity("opened", true), true);
  window.addEventListener("blur", () => sendActivity("blurred", true), true);
  window.addEventListener("pageshow", () => {
    if (!pageIsActuallyVisible()) return;
    setTimeout(() => sendActivity("opened", true), 800);
  }, true);

  setTimeout(() => {
    if (pageIsActuallyVisible()) sendActivity("opened", true);
  }, 1800);
})();
