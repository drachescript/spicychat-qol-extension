// Cosmetic Story Mode layout only. Never modifies native text or generation.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const flag = 'ds-qol-story-reading-layout';
  function apply() {
    const active = DS.state?.settings?.enabled !== false &&
      DS.state?.settings?.storyReadingLayout === true &&
      /^\/story\/[^/]+/i.test(location.pathname);
    document.documentElement.classList.toggle(flag, active);
  }
  DS.applyStoryReadingLayout = apply;
  DS.removeStoryReadingLayout = () => document.documentElement.classList.remove(flag);
})();
}
