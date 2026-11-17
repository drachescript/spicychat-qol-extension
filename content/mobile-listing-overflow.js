// QoL mobile compatibility: correct native sidebars only if results are visibly
// displaced beyond a phone viewport. Preserve native filtering and React ownership.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const LISTING_SELECTOR = '[data-testid="SearchClientCharacterListing"]';
  const BODY_SELECTOR = '[data-testid="SearchClientCharacterListingBody"]';
  const STYLE_ID = 'ds-mobile-listing-overflow-style';
  const ATTR = 'data-ds-mobile-listing-fix';
  const SIDEBAR_ATTR = 'data-ds-mobile-listing-sidebar';
  const RESULTS_ATTR = 'data-ds-mobile-listing-results';
  const ANCESTOR_ATTR = 'data-ds-mobile-listing-ancestor';
  const mobile = window.matchMedia?.('(max-width: 700px)');
  if (!mobile) return;

  let currentRoot = null;
  let currentSidebar = null;
  let currentResults = null;
  let currentAncestors = [];
  let activationRoute = '';

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (max-width: 700px) {
        [${ANCESTOR_ATTR}="1"] {
          min-width: 0 !important;
          max-width: 100% !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
        [${ATTR}="1"] {
          display: flex !important;
          flex-direction: column !important;
          min-width: 0 !important;
          max-width: 100% !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
        /* Keep the native filter drawer in the DOM. Removing only the
           width-contributing wrapper lets SpicyChat's own sliders button
           control its drawer, without any duplicate QoL filter controls. */
        [${ATTR}="1"] > [${SIDEBAR_ATTR}="1"] {
          display: contents !important;
        }
        [${ATTR}="1"] > [${RESULTS_ATTR}="1"] {
          flex: 1 1 auto !important;
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
        }
        /* Only the confirmed displaced Favorites listing is altered. Do not
           force normal native filter bars or other listing pages to reflow. */
        [${ATTR}="1"] [data-testid="AppliedFiltersBarView"] {
          min-width: 0 !important;
          max-width: 100% !important;
        }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function cleanup() {
    currentRoot?.removeAttribute(ATTR);
    currentSidebar?.removeAttribute(SIDEBAR_ATTR);
    currentResults?.removeAttribute(RESULTS_ATTR);
    for (const el of currentAncestors) el.removeAttribute(ANCESTOR_ATTR);
    currentRoot = null;
    currentSidebar = null;
    currentResults = null;
    currentAncestors = [];
    activationRoute = '';
  }

  function activate(layout, sidebar, results, listing) {
    if (currentRoot === layout && currentSidebar === sidebar &&
        currentResults === results) return;
    cleanup();
    installStyle();
    currentRoot = layout;
    currentSidebar = sidebar;
    currentResults = results;
    activationRoute = location.pathname;
    // Mark only the actual layout row, not the native filter drawer.
    layout.setAttribute(ATTR, '1');
    sidebar.setAttribute(SIDEBAR_ATTR, '1');
    results.setAttribute(RESULTS_ATTR, '1');
    // Native listing containers may wrap the row in another flex element.
    for (let node = layout.parentElement; node && listing?.contains(node); node = node.parentElement) {
      node.setAttribute(ANCESTOR_ATTR, '1');
      currentAncestors.push(node);
      if (node === listing) break;
    }
  }

  function mobileViewport() {
    const viewport = document.documentElement.clientWidth || window.innerWidth;
    return viewport > 0 && viewport <= 700 ? viewport : 0;
  }

  function candidateFor(sticky, listing, viewport) {
    // Prefer the actual native sidebar; tolerate its having a wrapper div.
    // Never pick a card's own sticky element as a sidebar.
    let item = sticky;
    for (let depth = 0; depth < 4 && item && item !== listing; depth++, item = item.parentElement) {
      const layout = item.parentElement;
      if (!layout || !listing.contains(layout) || layout.children.length < 2) continue;
      if (layout.firstElementChild !== item) continue;
      // Older Favorites builds could insert the QoL action strip as a sibling
      // between the native sidebar and the results. Skip only that known strip.
      let results = item.nextElementSibling;
      if (results?.id === 'ds-listing-qol-controls' && results.dataset.dsOwned === '1') {
        results = results.nextElementSibling;
      }
      if (!results) continue;
      const sidebarBox = item.getBoundingClientRect();
      if (sidebarBox.width < 160 || sidebarBox.width >= viewport * 1.8) continue;
      const rootBox = layout.getBoundingClientRect();
      const resultsBox = results.getBoundingClientRect();
      if (resultsBox.width < 60 || resultsBox.height < 20) continue;
      // Require native results or a V2 results container, not an adjacent
      // unrelated form or the sibling of a button inside a filter panel.
      const card = results.querySelector('a[href*="/chatbot/"], a[href*="/chat/"], [data-testid*="CharacterCard"]');
      const resultsBody = results.matches(BODY_SELECTOR) || !!results.querySelector(BODY_SELECTOR);
      if (!card && !resultsBody) continue;
      const cardBox = card?.getBoundingClientRect();
      const displaced = resultsBox.left > viewport * 0.60 ||
        (cardBox && cardBox.left > viewport * 0.72) ||
        resultsBox.left - rootBox.left > Math.min(165, viewport * 0.36);
      const overflowing = resultsBox.right > viewport + 35 ||
        (cardBox && cardBox.right > viewport + 35) ||
        layout.scrollWidth > layout.clientWidth + 50;
      if (displaced && overflowing) return { layout, sidebar: item, results };
    }
    return null;
  }

  function inspect() {
    const settings = window.DragonScriptQoL?.state?.settings;
    if (!mobile.matches || !mobileViewport() || settings?.enabled === false ||
        window.__DSQ_TAB_GATE__?.paused) { cleanup(); return; }

    const listing = document.querySelector(LISTING_SELECTOR) || document.querySelector(BODY_SELECTOR);
    if (!listing) { cleanup(); return; }
    if (currentRoot) {
      if (activationRoute !== location.pathname || !listing.contains(currentRoot) ||
          !currentSidebar?.isConnected || !currentResults?.isConnected) {
        cleanup();
      } else return;
    }

    const viewport = mobileViewport();
    const favoriteRoute = /^\/favorite-bots(?:\/|$)/.test(location.pathname);
    // The legacy correction applies only to the original direct-child row.
    // Nested structure detection is intentionally Favorites-only.
    if (!favoriteRoute) {
      const sidebar = listing.children[0];
      if (!sidebar?.classList.contains('sticky') || !sidebar.classList.contains('shrink-0')) return;
      const found = candidateFor(sidebar, listing, viewport);
      if (found && found.layout === listing) activate(found.layout, found.sidebar, found.results, listing);
      return;
    }
    const stickies = listing.querySelectorAll('.sticky, .shrink-0');
    for (let i = 0; i < Math.min(40, stickies.length); i++) {
      const found = candidateFor(stickies[i], listing, viewport);
      if (found) { activate(found.layout, found.sidebar, found.results, listing); return; }
    }
  }

  function start() {
    if (!document.body) return;
    inspect();
    // Retain the existing mobile-only SPA route check; no second observer or
    // additional timer. Hidden tabs do not run layout checks.
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      inspect();
    }, 3000);
    mobile.addEventListener?.('change', inspect);
    window.addEventListener('resize', inspect, { passive: true });
    window.addEventListener('pageshow', inspect);
    window.addEventListener('pagehide', () => {
      window.clearInterval(interval);
      cleanup();
    }, { once: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
}
