/* Regression checks for the Maximum Performance settings preset and user opt-outs. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'settings/options-performance-presets.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'options.html'), 'utf8');
assert.match(page, /id="maximumPerformancePresetNote"/);
const keys = [
  'chatPerformanceMode', 'desktopAppPerformanceGuard', 'pauseQolInHiddenTabs',
  'autoPerformanceLargeChats', 'deferQolWhileTyping', 'pauseQolWhileMessageEditing',
  'reduceQolAnimations', 'reduceOptionsAnimations'
];
function environment(saved = {}, initialMode = 'adaptive') {
  const elements = {};
  for (const id of [...keys, 'runtimePerformanceMode', 'performanceDiagnostics']) {
    elements[id] = {
      id, checked: false, value: id === 'runtimePerformanceMode' ? initialMode : '',
      handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; },
      fire(type = 'change') { this.handlers[type]?.({ target: this }); }
    };
  }
  const context = {
    loadedSettingsSnapshot: { ...saved },
    settingsAutosaveReady: true,
    $: id => elements[id],
    value: id => elements[id]?.value,
    checked: id => !!elements[id]?.checked,
    applyOptionsPerformancePreferences: () => {},
    queueSettingsAutosaveForControl: input => { context.loadedSettingsSnapshot[input.id] = !!input.checked; },
    queueSettingsAutosaveValue: (key, next) => { context.loadedSettingsSnapshot[key] = next; }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'options-performance-presets.js' });
  context.setupMaximumPerformancePreset();
  return { context, elements };
}
{
  const { context, elements } = environment();
  elements.runtimePerformanceMode.value = 'maximum';
  elements.runtimePerformanceMode.fire();
  assert.ok(keys.every(id => elements[id].checked), 'Maximum should enable all eight helper options');
  assert.equal(elements.performanceDiagnostics.checked, false, 'Diagnostics must stay opt-in');
  assert.equal(context.loadedSettingsSnapshot.maximumPerformancePresetInitialized, true);
  elements.pauseQolInHiddenTabs.checked = false;
  elements.pauseQolInHiddenTabs.fire();
  // Simulate the global autosave listener which follows the preset listener.
  context.queueSettingsAutosaveForControl(elements.pauseQolInHiddenTabs);
  assert.deepEqual([...context.loadedSettingsSnapshot.maximumPerformanceOptOuts], ['pauseQolInHiddenTabs']);
  elements.runtimePerformanceMode.value = 'adaptive';
  elements.runtimePerformanceMode.fire();
  elements.runtimePerformanceMode.value = 'maximum';
  elements.runtimePerformanceMode.fire();
  assert.equal(elements.pauseQolInHiddenTabs.checked, false, 'Explicit OFF choice must survive reselection');
  assert.ok(keys.filter(k => k !== 'pauseQolInHiddenTabs').every(id => elements[id].checked));
  // Settings reload does not re-enable opt-out controls.
  const reload = environment(context.loadedSettingsSnapshot, 'maximum');
  for (const id of keys) reload.elements[id].checked = !!context.loadedSettingsSnapshot[id];
  reload.context.initializeMaximumPerformancePreset();
  assert.equal(reload.elements.pauseQolInHiddenTabs.checked, false);
  reload.elements.pauseQolInHiddenTabs.checked = true;
  reload.elements.pauseQolInHiddenTabs.fire();
  assert.equal(reload.context.loadedSettingsSnapshot.maximumPerformanceOptOuts.length, 0);
}
{
  const { context, elements } = environment({ maximumPerformancePresetInitialized: false }, 'maximum');
  context.initializeMaximumPerformancePreset();
  assert.ok(keys.every(id => elements[id].checked), 'Previously selected Maximum gets its one-time defaults');
}
console.log('PASS Maximum Performance preset, opt-outs, reselection, reload, migration');
