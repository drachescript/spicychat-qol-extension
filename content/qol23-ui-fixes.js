(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS || window.__DS_QOL_023_UI_FIXES__) return;
  window.__DS_QOL_023_UI_FIXES__ = true;

  // 0.2.23: "stack" means one shared centered lane, not merely matching the
  // left edge. Keep this as CSS so React message mounts/remounts need no DOM work.
  const style = document.createElement("style");
  style.id = "ds-qol-023-stacked-lane-style";
  style.textContent = `
html[data-ds-chat-message-layout="stacked"]
  div[id^="message-"] > div > div > div.w-full.flex.mb-lg.bg-transparent.items-center {
  justify-content: center !important;
  width: 100% !important;
  max-width: 800px !important;
  margin-inline: auto !important;
  padding-inline: 10px !important;
  box-sizing: border-box !important;
}

html[data-ds-chat-message-layout="stacked"]
  div[id^="message-"] > div > div > div.w-full.flex.mb-lg.bg-transparent.items-center > div:first-child:empty {
  display: none !important;
}

html[data-ds-chat-message-layout="stacked"]
  div[id^="message-"] > div > div > div.w-full.flex.mb-lg.bg-transparent.items-center > div:nth-child(2) {
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  flex: 1 1 auto !important;
  box-sizing: border-box !important;
}

@media (max-width: 760px) {
  html[data-ds-chat-message-layout="stacked"]
    div[id^="message-"] > div > div > div.w-full.flex.mb-lg.bg-transparent.items-center {
    padding-inline: 8px !important;
  }
}
`;
  (document.head || document.documentElement).appendChild(style);

  // The panel shell should not exist visually when every route-eligible panel
  // row is disabled. We inspect the state already computed by quick-panel.js;
  // no page-wide MutationObserver or polling is needed.
  function inlineVisibleThroughBody(element, body) {
    let node = element;
    while (node && node !== body) {
      if (node.hidden || node.style?.display === "none") return false;
      node = node.parentElement;
    }
    return !!body && body.style?.display !== "none";
  }

  function panelHasUsableContent(panel) {
    const body = panel?.querySelector?.(".ds-qol-body");
    if (!body) return false;

    const actionable = [...body.querySelectorAll("button, input, select, textarea, a")]
      .some(element => inlineVisibleThroughBody(element, body));
    if (actionable) return true;

    // Status-only configurations are valid too. Hidden descendants do not count.
    return [...body.querySelectorAll(".ds-qol-status, .ds-qol-small-note")].some(element => {
      if (!inlineVisibleThroughBody(element, body)) return false;
      return !!String(element.textContent || "").trim();
    });
  }

  function reconcileQuickPanelShell() {
    const panel = document.getElementById("ds-qol-panel");
    if (!panel) return;

    const settings = DS.state?.settings || {};
    const globallyAllowed = !!settings.enabled && !!settings.showQuickPanel && DS.isQuickPanelEnabledForTab?.() !== false;
    if (!globallyAllowed) {
      panel.style.removeProperty("display");
      delete panel.dataset.dsAutoHiddenEmpty;
      return;
    }

    // Collapsing the panel hides the body via stylesheet. Eligibility is based
    // on the rows quick-panel.js marked display:none/visible, so closed panels
    // remain available when they actually contain something useful.
    const hasContent = panelHasUsableContent(panel);
    if (hasContent) {
      if (panel.dataset.dsAutoHiddenEmpty === "1") panel.style.removeProperty("display");
      delete panel.dataset.dsAutoHiddenEmpty;
    } else {
      panel.dataset.dsAutoHiddenEmpty = "1";
      panel.style.setProperty("display", "none", "important");
    }
  }

  const originalUpdate = DS.updateQuickPanel;
  if (typeof originalUpdate === "function") {
    DS.updateQuickPanel = function qol023UpdateQuickPanel(...args) {
      const result = originalUpdate.apply(this, args);
      reconcileQuickPanelShell();
      return result;
    };
  }

  const originalCreate = DS.createQuickPanel;
  if (typeof originalCreate === "function") {
    DS.createQuickPanel = function qol023CreateQuickPanel(...args) {
      const result = originalCreate.apply(this, args);
      reconcileQuickPanelShell();
      return result;
    };
  }

  // A SPA route pass normally calls updateQuickPanel already; popstate is a
  // cheap extra safety net for browser back/forward without any polling.
  window.addEventListener("popstate", () => requestAnimationFrame(reconcileQuickPanelShell), { passive: true });
  requestAnimationFrame(reconcileQuickPanelShell);
})();
