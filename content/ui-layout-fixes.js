(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS || window.__DS_QOL_UI_LAYOUT_FIXES__) return;
  window.__DS_QOL_UI_LAYOUT_FIXES__ = true;

  // Shared UI layout fixes: keep stacked chat messages and the native composer on
  // one centered lane, and hide an otherwise-empty Quick Panel shell.
  const style = document.createElement("style");
  style.id = "ds-qol-ui-layout-style";
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

html[data-ds-chat-message-layout="stacked"] [data-ds-stacked-composer-row="1"] {
  translate: var(--ds-stacked-composer-shift, 0px) 0 !important;
  transition: none !important;
}

html[data-ds-chat-message-layout="stacked"] [data-ds-stacked-composer-bubble="1"] {
  width: min(var(--ds-stacked-composer-width, 800px), calc(100vw - 40px)) !important;
  max-width: min(var(--ds-stacked-composer-width, 800px), calc(100vw - 40px)) !important;
  min-width: 0 !important;
  flex: 0 1 min(var(--ds-stacked-composer-width, 800px), calc(100vw - 40px)) !important;
  box-sizing: border-box !important;
}

@media (max-width: 760px) {
  html[data-ds-chat-message-layout="stacked"]
    div[id^="message-"] > div > div > div.w-full.flex.mb-lg.bg-transparent.items-center {
    padding-inline: 8px !important;
  }

  html[data-ds-chat-message-layout="stacked"] [data-ds-stacked-composer-row="1"] {
    translate: 0 0 !important;
  }

  html[data-ds-chat-message-layout="stacked"] [data-ds-stacked-composer-bubble="1"] {
    width: auto !important;
    max-width: none !important;
    flex: 1 1 auto !important;
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
    DS.updateQuickPanel = function uiLayoutUpdateQuickPanel(...args) {
      const result = originalUpdate.apply(this, args);
      reconcileQuickPanelShell();
      return result;
    };
  }

  const originalCreate = DS.createQuickPanel;
  if (typeof originalCreate === "function") {
    DS.createQuickPanel = function uiLayoutCreateQuickPanel(...args) {
      const result = originalCreate.apply(this, args);
      reconcileQuickPanelShell();
      return result;
    };
  }

  window.addEventListener("popstate", () => requestAnimationFrame(reconcileQuickPanelShell), { passive: true });
  requestAnimationFrame(reconcileQuickPanelShell);
})();
