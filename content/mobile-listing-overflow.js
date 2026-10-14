// QoL mobile compatibility: collapse the native fixed-width listing filter sidebar
// only when it is demonstrably pushing the results outside the phone viewport.
// Do not modify desktop listings or remove SpicyChat's native filter controls.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const ROOT_SELECTOR = '[data-testid="SearchClientCharacterListing"]';
  const BUTTON_ID = 'ds-mobile-listing-filters-button';
  const STYLE_ID = 'ds-mobile-listing-overflow-style';
  const ATTR = 'data-ds-mobile-listing-fix';
  const OPEN_ATTR = 'data-ds-mobile-filters-open';
  const mobile = window.matchMedia?.('(max-width: 700px)');
  if (!mobile) return;
  let currentRoot = null;
  let currentButton = null;
  let opened = false;

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (max-width: 700px) {
        [data-testid="SearchClientCharacterListing"][${ATTR}="1"] {
          display: flex !important;
          flex-direction: column !important;
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
        }
        [data-testid="SearchClientCharacterListing"][${ATTR}="1"] > :first-child {
          display: none !important;
          position: relative !important;
          top: auto !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          max-height: none !important;
          margin-right: 0 !important;
          box-sizing: border-box !important;
        }
        [data-testid="SearchClientCharacterListing"][${ATTR}="1"][${OPEN_ATTR}="1"] > :first-child {
          display: flex !important;
          max-height: min(52dvh, 430px) !important;
          overflow-y: auto !important;
          overscroll-behavior: contain;
          margin-bottom: 10px !important;
        }
        [data-testid="SearchClientCharacterListing"][${ATTR}="1"][${OPEN_ATTR}="1"] > :first-child > div {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
        }
        [data-testid="SearchClientCharacterListing"][${ATTR}="1"] > :nth-child(2) {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          flex: 1 1 auto !important;
          box-sizing: border-box !important;
        }
        #${BUTTON_ID} {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          align-self: flex-start;
          max-width: calc(100vw - 24px);
          padding: 7px 11px;
          margin: 8px 0;
          background: #292a31;
          border: 1px solid #555962;
          border-radius: 9px;
          color: inherit;
          font: inherit;
          font-size: 13px;
          cursor: pointer;
        }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function cleanup() {
    currentRoot?.removeAttribute(ATTR);
    currentRoot?.removeAttribute(OPEN_ATTR);
    currentButton?.remove();
    currentRoot = null;
    currentButton = null;
    opened = false;
  }

  function update() {
    if (!currentRoot?.isConnected) { cleanup(); return; }
    currentRoot.setAttribute(OPEN_ATTR, opened ? '1' : '0');
    if (currentButton) {
      currentButton.textContent = opened ? 'Hide filters' : 'Show filters';
      currentButton.setAttribute('aria-expanded', String(opened));
    }
  }

  function activate(root) {
    if (currentRoot === root) {
      if (!currentButton?.isConnected) { cleanup(); }
      else return;
    }
    cleanup();
    installStyle();
    currentRoot = root;
    root.setAttribute(ATTR, '1');
    // Insert outside the native listing DOM. React still owns its sidebar/cards.
    const button = document.createElement('button');
    button.type = 'button';
    button.id = BUTTON_ID;
    button.setAttribute('aria-controls', '');
    button.addEventListener('click', () => { opened = !opened; update(); });
    root.before(button);
    currentButton = button;
    update();
  }

  function inspect() {
    const settings = window.DragonScriptQoL?.state?.settings;
    if (!mobile.matches || settings?.enabled === false || window.__DSQ_TAB_GATE__?.paused) {
      cleanup();
      return;
    }
    const root = document.querySelector(ROOT_SELECTOR);
    if (currentRoot && root !== currentRoot) cleanup();
    if (!root || root.children.length < 2 || currentRoot === root) return;
    // This is the new native sidebar: fixed width, sticky, next to a full-width
    // results column. Do not mistake normal character cards for filter panels.
    const sidebar = root.children[0];
    const results = root.children[1];
    if (!sidebar.classList.contains('sticky') || !sidebar.classList.contains('shrink-0')) return;
    const viewport = document.documentElement.clientWidth || window.innerWidth;
    if (!viewport || viewport > 700) return;
    const sidebarBox = sidebar.getBoundingClientRect();
    const rootBox = root.getBoundingClientRect();
    const resultsBox = results.getBoundingClientRect();
    const overflow = root.scrollWidth > root.clientWidth + 50 || resultsBox.right > viewport + 45;
    const displaced = resultsBox.left - rootBox.left > Math.min(165, viewport * 0.36);
    if (sidebarBox.width >= 180 && overflow && displaced) activate(root);
  }

  function start() {
    if (!document.body) return;
    inspect();
    // A low-frequency check also covers SPA routes. It only runs on phones,
    // and performs no card scanning or subtree mutation observation.
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
