// Compact mobile launcher for the existing optional Bot Organizer toolbar.
// Leaves all organizer controls intact and never changes native SpicyChat layout.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const ID = 'ds-bot-org-mobile-toggle';
  const STYLE_ID = 'ds-bot-org-mobile-compact-style';
  const QUERY = '(max-width: 700px)';
  const DS = window.DragonScriptQoL || {};
  const media = window.matchMedia?.(QUERY);
  if (!media) return;
  let expanded = false;
  let toolbarObserver = null;
  let observedToolbar = null;

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (max-width:700px) {
        #ds-bot-organizer-toolbar[data-ds-mobile-collapsed="1"] {
          left: auto !important;
          right: max(8px, env(safe-area-inset-right)) !important;
          bottom: max(70px, calc(58px + env(safe-area-inset-bottom))) !important;
          width: auto !important;
          max-width: calc(100vw - 16px) !important;
          padding: 5px !important;
          display: flex !important;
          overflow: visible !important;
          grid-template-columns: none !important;
        }
        #ds-bot-organizer-toolbar[data-ds-mobile-collapsed="1"] > :not(#${ID}) {
          display: none !important;
        }
        #ds-bot-organizer-toolbar #${ID} {
          display: inline-flex !important;
          width: auto !important;
          min-width: 0 !important;
          align-items: center;
          justify-content: center;
          white-space: nowrap;
          padding: 6px 10px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        #ds-bot-organizer-toolbar[data-ds-mobile-collapsed="0"] #${ID} {
          grid-column: 1 / -1;
        }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function updateToolbar(toolbar) {
    const button = toolbar.querySelector(`#${ID}`);
    if (!button) return;
    toolbar.dataset.dsMobileCollapsed = expanded ? '0' : '1';
    button.textContent = expanded ? 'Close organizer' : 'Organize bots';
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', expanded ? 'Close bot organizer controls' : 'Open bot organizer controls');
  }

  function refresh() {
    const toolbar = document.getElementById('ds-bot-organizer-toolbar');
    if (!media.matches || !toolbar) {
      if (observedToolbar) {
        toolbarObserver?.disconnect();
        observedToolbar.removeAttribute('data-ds-mobile-collapsed');
        observedToolbar.querySelector(`#${ID}`)?.remove();
        observedToolbar = null;
      }
      return;
    }
    const settings = DS.state?.settings;
    if (settings && (!settings.enabled || !settings.enableBotOrganizer)) return;
    installStyle();
    if (observedToolbar !== toolbar) {
      toolbarObserver?.disconnect();
      observedToolbar = toolbar;
      toolbarObserver = new MutationObserver(() => {
        // The organizer occasionally replaces all controls after mode changes.
        // Observe only its immediate children, never the full page subtree.
        if (!toolbar.querySelector(`#${ID}`)) refresh();
      });
      toolbarObserver.observe(toolbar, { childList: true });
    }
    if (!toolbar.querySelector(`#${ID}`)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = ID;
      button.addEventListener('click', () => {
        expanded = !expanded;
        updateToolbar(toolbar);
      });
      toolbar.prepend(button);
    }
    updateToolbar(toolbar);
  }

  function start() {
    // The original organizer appends this toolbar directly to document.body.
    // A direct-child observer catches its creation/removal without watching
    // thousands of listing/card mutations.
    const parent = document.body;
    if (!parent) return;
    const observer = new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes, ...record.removedNodes]
        .some(node => node.nodeType === 1 && (node.id === 'ds-bot-organizer-toolbar' || node.querySelector?.('#ds-bot-organizer-toolbar'))))) {
        refresh();
      }
    });
    observer.observe(parent, { childList: true });
    media.addEventListener?.('change', refresh);
    window.addEventListener('pagehide', () => {
      observer.disconnect();
      toolbarObserver?.disconnect();
    }, { once: true });
    refresh();
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
}
