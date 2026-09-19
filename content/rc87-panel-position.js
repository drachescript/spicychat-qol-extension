(() => {
  "use strict";

  const STYLE_ID = "ds-rc87-listing-panel-position-style";
  const ROOT_CLASS = "ds-rc87-listing-panel-offset";

  function supportedListingRoute() {
    const path = String(location.pathname || "").replace(/\/+$/, "") || "/";
    return path === "/" || path === "/recommended-bots";
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html.${ROOT_CLASS} #ds-qol-panel[data-ds-panel-placement="top-right"] {
        top: 120px !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function syncRouteClass() {
    ensureStyle();
    document.documentElement.classList.toggle(ROOT_CLASS, supportedListingRoute());
  }

  // Runs immediately after quick-panel.js in the manifest, before the heavier
  // listing modules. The CSS rule therefore owns the first painted position on
  // Home/Recommendations instead of letting the panel appear at 68px and jump
  // down after a later collision measurement.
  syncRouteClass();
  for (const method of ["pushState", "replaceState"]) {
    try {
      const original = history[method];
      if (typeof original !== "function" || original.__dsRc87PanelWrapped) continue;
      const wrapped = function(...args) {
        const result = original.apply(this, args);
        setTimeout(syncRouteClass, 0);
        return result;
      };
      wrapped.__dsRc87PanelWrapped = true;
      history[method] = wrapped;
    } catch {}
  }
  window.addEventListener("popstate", () => setTimeout(syncRouteClass, 0), true);
  document.addEventListener("click", event => {
    if (!(event.target instanceof Element) || !event.target.closest("a[href]")) return;
    setTimeout(syncRouteClass, 0);
  }, true);
})();
