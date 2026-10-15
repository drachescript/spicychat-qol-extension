// Optional, session-only Rulebook diagnostics. Observes ONLY SpicyChat's visible
// Rulebook HUD; never reads the Rulebook engine, hidden rules or chat messages.
// This module is inert unless the user explicitly enables it in Settings.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const ROOT_ID = 'ds-rulebook-diagnostics';
  const HUD = '[data-testid="RulebookMeterPanel"]';
  const LIMIT = 150;
  const MAX_STATUS = 320;
  const SOURCE = 'visible-rulebook-hud';
  let activeRoute = '';
  let observedPanel = null;
  let observer = null;
  let statusObserver = null;
  let observedStatus = null;
  let settleTimer = 0;
  let rows = [];
  let last = null;
  let opened = false;

  const tidy = value => String(value || '').replace(/\s+/g, ' ').trim();
  const time = () => new Date().toISOString();
  function enabled() {
    return DS.state?.settings?.enabled !== false && DS.state?.settings?.enableRulebookDiagnostics === true && !!DS.isSingleChatPage?.();
  }
  function readVisibleHud() {
    const hud = document.querySelector(HUD);
    // Minimized or hidden meters must not be interpreted as zero or deleted.
    if (!hud || !hud.isConnected || !hud.getClientRects().length) return null;
    const snapshot = DS.snapshotVisibleRulebook?.();
    if (!snapshot || !Array.isArray(snapshot.meters)) return null;
    const meters = snapshot.meters
      .filter(meter => meter?.id && typeof meter.value === 'number' && Number.isFinite(meter.value))
      .slice(0, 64)
      .map(meter => ({ id: String(meter.id).slice(0, 90), label: tidy(meter.label).slice(0, 100), value: meter.value }));
    const status = tidy(snapshot.status).slice(0, MAX_STATUS);
    if (!meters.length && !status) return null;
    return { source: SOURCE, capturedAt: time(), ...(snapshot.name ? { name: tidy(snapshot.name).slice(0, 140) } : {}), ...(snapshot.id ? { id: String(snapshot.id).slice(0, 100) } : {}), status, meters };
  }
  function record(type, details) {
    rows.push({ at: time(), type, ...details });
    if (rows.length > LIMIT) rows = rows.slice(-LIMIT);
  }
  function takeSnapshot() {
    if (!enabled()) return;
    const next = readVisibleHud();
    if (!next) { refresh(); return; }
    if (!last) {
      record('first-visible-snapshot', { snapshot: next });
    } else if ((last.id && next.id && last.id !== next.id) ||
               (last.name && next.name && last.name !== next.name)) {
      record('visible-rulebook-changed', {
        from: { id: last.id || '', name: last.name || '' },
        to: { id: next.id || '', name: next.name || '' }, snapshot: next
      });
      last = next;
      refresh();
      return;
    } else {
      const before = new Map(last.meters.map(meter => [meter.id, meter]));
      for (const meter of next.meters) {
        const previous = before.get(meter.id);
        if (!previous) record('meter-became-visible', { meter });
        else if (previous.value !== meter.value) record('visible-meter-change', {
          meter: meter.label, meterId: meter.id, from: previous.value, to: meter.value
        });
      }
      if (last.status !== next.status && next.status) {
        record('visible-status-change', { from: last.status, to: next.status });
      }
      if (last.name && next.name && last.name !== next.name) {
        record('visible-rulebook-name-change', { from: last.name, to: next.name });
      }
    }
    // Ignore vanished meters; HUD collapse and React rerender are not Rulebook state changes.
    last = next;
    refresh();
  }
  function scheduleCapture() {
    if (!enabled() || settleTimer) return;
    settleTimer = setTimeout(() => { settleTimer = 0; takeSnapshot(); }, 450);
  }
  function watchHud() {
    const panel = document.querySelector(HUD);
    const status = document.querySelector('[data-testid="RulebookStatusLine"], [data-testid="RulebookHud-StatusLine"], [data-rulebook-status-line]');
    if (observedPanel !== panel) {
      observer?.disconnect(); observer = null; observedPanel = panel;
      if (panel) {
        observer = new MutationObserver(scheduleCapture);
        observer.observe(panel, { childList: true, subtree: true, attributes: true,
          attributeFilter: ['aria-label', 'data-state'], characterData: true });
        scheduleCapture();
      }
    }
    if (observedStatus !== status) {
      statusObserver?.disconnect(); statusObserver = null; observedStatus = status;
      if (status) {
        statusObserver = new MutationObserver(scheduleCapture);
        statusObserver.observe(status, { childList: true, subtree: true, characterData: true });
        scheduleCapture();
      }
    }
  }
  function button(label, callback, className) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    if (className) el.className = className;
    el.addEventListener('click', callback);
    return el;
  }
  function exportReport() {
    takeSnapshot();
    const report = {
      type: 'SpicyChat QoL visible Rulebook troubleshooting report',
      schemaVersion: 1,
      exportedAt: time(),
      captureScope: 'Visible Rulebook HUD only; session memory only; chat text and hidden Rulebook instructions are excluded',
      limitations: 'Changes observed while this panel is enabled do not establish why a Rulebook trigger fired. Minimized/hidden meters and missed changes are not reconstructed. Events are not proof of server-side state.',
      latestVisibleSnapshot: last,
      events: rows
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `spicychat-rulebook-visible-diagnostics-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  // Manual markers help line up a user's test actions with *visible* changes.
  // They do not watch clicks or read chat history, so no causation is inferred.
  function markTestAction(action) {
    if (!enabled()) return;
    takeSnapshot();
    record('manual-test-marker', { action, explanation: 'Added by the user, not detected by QoL' });
    refresh();
  }
  function refresh() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const drawer = root.querySelector('.ds-rb-diag-drawer');
    const launcher = root.querySelector('.ds-rb-diag-launcher');
    if (drawer.hidden !== !opened) drawer.hidden = !opened;
    launcher.setAttribute('aria-expanded', String(opened));
    const status = root.querySelector('.ds-rb-diag-status');
    const meters = root.querySelector('.ds-rb-diag-meters');
    const activity = root.querySelector('.ds-rb-diag-activity');
    const hud = document.querySelector(HUD);
    const visible = !!hud?.getClientRects().length;
    status.textContent = last
      ? `${last.name ? `${last.name} · ` : ''}${visible ? 'Last visible status' : 'Last captured status (HUD hidden)'}: ${last.status || 'not shown'}`
      : 'No visible Rulebook meters captured yet. A hidden or missing HUD does not mean no Rulebook is attached.';
    meters.replaceChildren();
    if (last?.meters?.length) {
      for (const meter of last.meters) {
        const row = document.createElement('div');
        const title = document.createElement('span'); title.textContent = meter.label || meter.id;
        const value = document.createElement('strong'); value.textContent = String(meter.value);
        row.append(title, value); meters.append(row);
      }
    } else {
      meters.textContent = 'No visible meter values captured.';
    }
    activity.textContent = `${rows.length} observations in this tab (last ${LIMIT} maximum). This does not capture every server-side turn or trigger.`;
    root.querySelector('.ds-rb-diag-export').disabled = !rows.length;
    const recent = root.querySelector('.ds-rb-diag-recent');
    recent.replaceChildren();
    for (const row of rows.slice(-8).reverse()) {
      const line = document.createElement('li');
      const timeLabel = new Date(row.at).toLocaleTimeString();
      const summary = row.type === 'manual-test-marker' ? `Marked ${row.action}` :
        row.type === 'visible-meter-change' ? `${row.meter || row.meterId}: ${row.from} → ${row.to}` :
        row.type === 'visible-status-change' ? 'Visible status changed' :
        row.type === 'meter-became-visible' ? `${row.meter?.label || 'Meter'} became visible` :
        row.type.replace(/-/g, ' ');
      line.textContent = `${timeLabel} · ${summary}`;
      recent.append(line);
    }
  }
  function mount() {
    if (document.getElementById(ROOT_ID)) return;
    const root = document.createElement('aside');
    root.id = ROOT_ID;
    root.className = 'ds-rulebook-diagnostics';
    const launcher = button('Rulebook log', () => { opened = !opened; refresh(); }, 'ds-rb-diag-launcher');
    launcher.setAttribute('aria-controls', 'ds-rb-diag-drawer');
    launcher.setAttribute('aria-expanded', 'false');
    const drawer = document.createElement('section');
    drawer.id = 'ds-rb-diag-drawer';
    drawer.className = 'ds-rb-diag-drawer';
    drawer.hidden = true;
    drawer.setAttribute('role', 'region');
    drawer.setAttribute('aria-label', 'Visible Rulebook troubleshooting');
    const header = document.createElement('div'); header.className = 'ds-rb-diag-head';
    const title = document.createElement('strong'); title.textContent = 'Rulebook troubleshooting';
    const close = button('Close', () => { opened = false; refresh(); });
    header.append(title, close);
    const intro = document.createElement('p');
    intro.textContent = 'Read-only. Tracks changes to meters and status text while visible in this tab. No chat messages or hidden rules are collected.';
    const status = document.createElement('p'); status.className = 'ds-rb-diag-status';
    const meterTitle = document.createElement('strong'); meterTitle.textContent = 'Last visible meters';
    const meters = document.createElement('div'); meters.className = 'ds-rb-diag-meters';
    const activity = document.createElement('p'); activity.className = 'ds-rb-diag-activity';
    const markers = document.createElement('div'); markers.className = 'ds-rb-diag-actions';
    markers.append(
      button('Mark regenerate', () => markTestAction('regenerate')),
      button('Mark delete', () => markTestAction('delete')),
      button('Mark next turn', () => markTestAction('next-turn'))
    );
    const markerHint = document.createElement('p');
    markerHint.textContent = 'Use these markers when testing. They mark your action only; the log cannot tell why a trigger fired or whether server state reverted.';
    const recentTitle = document.createElement('strong'); recentTitle.textContent = 'Recent observations';
    const recent = document.createElement('ol'); recent.className = 'ds-rb-diag-recent';
    const actions = document.createElement('div'); actions.className = 'ds-rb-diag-actions';
    const download = button('Export JSON report', exportReport, 'ds-rb-diag-export');
    const clear = button('Clear session log', () => { rows = []; last = null; takeSnapshot(); refresh(); });
    actions.append(download, clear);
    drawer.append(header, intro, status, meterTitle, meters, activity, markers, markerHint, recentTitle, recent, actions);
    root.append(drawer, launcher);
    document.body.appendChild(root);
    refresh();
  }
  function stop() {
    observer?.disconnect(); observer = null; observedPanel = null;
    statusObserver?.disconnect(); statusObserver = null; observedStatus = null;
    clearTimeout(settleTimer); settleTimer = 0;
    document.getElementById(ROOT_ID)?.remove();
    rows = []; last = null; opened = false; activeRoute = '';
  }
  DS.removeRulebookDiagnostics = stop;
  DS.applyRulebookDiagnostics = function applyRulebookDiagnostics() {
    if (!enabled()) { if (activeRoute || observedPanel || document.getElementById(ROOT_ID)) stop(); return; }
    const route = location.pathname + location.search;
    if (route !== activeRoute) { stop(); activeRoute = route; }
    mount();
    watchHud();
    scheduleCapture();
  };
})();
}
