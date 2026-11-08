// Main runtime support: my creations block guard.
// Loaded before main.js; no observers or page work start during module loading.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  function isMyCreationsChatbotsPage() {
    return !!DS.getPageState?.().isMyCreationsChatbotsPage;
  }

  function removeMyCreationsBlockButtons() {
    if (!isMyCreationsChatbotsPage()) return 0;
    let removed = 0;
    document.querySelectorAll(".ds-card-block-button").forEach(button => {
      button.remove();
      removed += 1;
    });
    return removed;
  }

  function installMyCreationsBlockButtonGuard() {
    if (DS.__myCreationsBlockButtonGuardInstalled) return;
    const original = DS.applyCardBlockButtons;
    if (typeof original !== "function") return;

    DS.applyCardBlockButtons = function guardedApplyCardBlockButtons(...args) {
      const settings = DS.state?.settings || {};
      if (isMyCreationsChatbotsPage() && !settings.showBlockButtonOnMyCreations) {
        removeMyCreationsBlockButtons();
        return undefined;
      }
      return original.apply(this, args);
    };

    DS.__myCreationsBlockButtonGuardInstalled = true;
  }

  installMyCreationsBlockButtonGuard();


})();
}
