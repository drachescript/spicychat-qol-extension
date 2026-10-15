// Minimal Core adapter for Core + OOC builds. Uses Full QoL's storage keys.
// OOC insertion and composer controls themselves are shared, unchanged modules.
(() => {
  'use strict';
  const DS = window.DragonScriptQoL = window.DragonScriptQoL || {};
  const KEYS = ['enabled', 'showOocTools', 'replaceChatImageWithOocButton', 'hideChatImageButton', 'quickPanelShowOoc'];
  const DEFAULTS = Object.freeze({
    enabled: true,
    showOocTools: true,
    replaceChatImageWithOocButton: true,
    hideChatImageButton: false,
    quickPanelShowOoc: true
  });
  DS.state = { settings: { ...DS.DEFAULT_SETTINGS, ...DEFAULTS }, savedPersonas: [], oocShortcutMode: 'off' };
  DS.qsa = (selector, root = document) => { try { return Array.from(root.querySelectorAll(selector)); } catch { return []; } };
  DS.qs = (selector, root = document) => { try { return root.querySelector(selector); } catch { return null; } };
  DS.normalize = text => String(text || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  DS.isSingleChatPage = () => /^\/(?:[a-z]{2}\/)?chat\/[0-9a-f]{8}-[0-9a-f-]{27,}(?:\/|$)/i.test(location.pathname);
  DS.setTextIfChanged = (element, text) => { if (element && element.textContent !== text) element.textContent = text; };
  DS.setAttributeIfChanged = (element, name, value) => { if (element && element.getAttribute(name) !== String(value)) element.setAttribute(name, String(value)); };
  DS.setDatasetIfChanged = (element, key, value) => { if (element && element.dataset[key] !== String(value)) element.dataset[key] = String(value); };
  DS.setSafeMarkup = (element, markup) => {
    // Only used by content/ooc.js with an extension-owned constant, not site content.
    if (element) element.innerHTML = markup;
  };
  DS.runtimeLog = (level, feature, message) => { if (level === 'warn' || level === 'error') console.warn(`[QoL ${feature}] ${message}`); };
  DS.setQuickStatus = message => {
    let toast = document.getElementById('ds-qol-ooc-status');
    if (!toast) {
      toast = document.createElement('div'); toast.id = 'ds-qol-ooc-status';
      toast.setAttribute('role', 'status'); document.body.append(toast);
    }
    toast.textContent = String(message || '').slice(0, 260);
  };
  DS.setClassState = (node, name, enabled) => { if (node && node.classList.contains(name) !== !!enabled) node.classList.toggle(name, !!enabled); };
  DS.unhideElement = node => { if (node) { node.classList.remove('ds-hidden'); node.removeAttribute('data-ds-hidden'); } };
  const defaultTemplates = () => [
    { id: DS.DEFAULT_OOC_TEMPLATE_ID, name: 'Strict no-control', text: DS.DEFAULT_OOC_TEMPLATE, builtIn: true },
    { id: DS.HARD_OOC_TEMPLATE_ID, name: 'Hard no-control + formatting', text: DS.HARD_OOC_TEMPLATE, builtIn: true }
  ];
  function readSettings() {
    const keys = ['settings', 'oocTemplates', ...KEYS.map(key => `dsSettingV1:${key}`)];
    chrome.storage.local.get(keys, values => {
      if (chrome.runtime.lastError) { console.warn('QoL Core + OOC settings read failed', chrome.runtime.lastError.message); return; }
      const old = DS.state.settings;
      const next = { ...DS.DEFAULT_SETTINGS, ...DEFAULTS, ...(values.settings || {}) };
      for (const key of KEYS) if (Object.prototype.hasOwnProperty.call(values, `dsSettingV1:${key}`)) next[key] = values[`dsSettingV1:${key}`];
      // Full QoL stores OOC presets both in settings and as a dedicated oocTemplates list.
      if (Array.isArray(values.oocTemplates)) next.oocTemplates = values.oocTemplates;
      if (!Array.isArray(next.oocTemplates) || !next.oocTemplates.length) next.oocTemplates = defaultTemplates();
      DS.state.settings = next;
      if (!next.enabled) stop();
      else schedule();
    });
  }
  let observer = null;
  let pending = 0;
  let active = false;
  function stop() {
    clearTimeout(pending); pending = 0;
    DS.removeOocTools?.();
    DS.removeEssentialOocShortcut?.();
    DS.state.oocShortcutMode = 'off';
    document.getElementById('ds-qol-panel')?.remove();
    active = false;
  }
  function reconcile() {
    pending = 0;
    const settings = DS.state.settings;
    if (!settings.enabled || !DS.isSingleChatPage()) { if (active) stop(); return; }
    active = true;
    if (settings.showOocTools && settings.quickPanelShowOoc) {
      let panel = document.getElementById('ds-qol-panel');
      if (!panel) {
        panel = document.createElement('section'); panel.id = 'ds-qol-panel';
        panel.setAttribute('aria-label', 'QoL OOC templates');
        const body = document.createElement('div'); body.className = 'ds-qol-body'; panel.append(body);
        document.body.append(panel);
      }
    } else document.getElementById('ds-qol-panel')?.remove();
    DS.applyOocTools?.();
    if (settings.replaceChatImageWithOocButton) DS.applyEssentialOocShortcut?.();
    else DS.removeEssentialOocShortcut?.();
  }
  function schedule() { if (!pending) pending = setTimeout(reconcile, 130); }
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings || changes.oocTemplates || KEYS.some(k => changes[`dsSettingV1:${k}`])) readSettings();
  });
  const boot = () => {
    if (!document.body || observer) return;
    observer = new MutationObserver(mutations => {
      // Coalesce native React composer changes. Never reprocess text or QoL-owned DOM.
      if (!DS.isSingleChatPage()) return;
      if (mutations.some(m => m.addedNodes.length && !m.target?.closest?.('#ds-qol-panel, #ds-qol-ooc-status'))) schedule();
    });
    observer.observe(document.body, {childList: true, subtree: true});
    readSettings();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
  window.addEventListener('pagehide', () => { observer?.disconnect(); stop(); }, {once: true});
  window.__DSQ_CORE_OOC_TEST__ = {reconcile, stop, getSettings: () => ({...DS.state.settings})};
})();
