// Main runtime support: presentation helpers.
// Loaded before main.js; no observers or page work start during module loading.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  function applyRuntimePerformancePresentation() {
    const enabled = !!DS.state?.settings?.reduceQolAnimations;
    let style = document.getElementById("ds-qol-performance-style");
    if (document.documentElement.classList.contains("ds-qol-reduced-motion") !== enabled) {
      document.documentElement.classList.toggle("ds-qol-reduced-motion", enabled);
    }
    if (enabled && !style) {
      style = document.createElement("style");
      style.id = "ds-qol-performance-style";
      style.dataset.dsOwned = "1";
      style.textContent = `.ds-qol-reduced-motion [class*="ds-"], .ds-qol-reduced-motion [id^="ds-"] { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }`;
      (document.head || document.documentElement).appendChild(style);
    } else if (!enabled) {
      style?.remove();
    }
  }

  function installTypingPerformanceTracker() {
    if (DS.state.typingPerformanceTrackerInstalled) return;
    DS.state.typingPerformanceTrackerInstalled = true;
    const markTyping = event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.matches("textarea, [contenteditable='true']")) return;
      if (!DS.isSingleChatPage?.()) return;
      DS.state.userTypingUntil = Date.now() + 900;
    };
    document.addEventListener("input", markTyping, true);
    document.addEventListener("keydown", markTyping, true);
  }

  DS.mainPresentationHelpers = Object.freeze({
    applyRuntimePerformancePresentation, installTypingPerformanceTracker
  });

})();
}
