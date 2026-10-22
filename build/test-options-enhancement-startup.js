'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../shared/feature-registry.js'), 'utf8');
const controllerState = `
  let botAvailabilityState = { meta: { abc: { status: 'unknown' } } };
  let botArchiveState = { meta: {} };
  let openedChatMetaState = {};
  let favoriteBotState = { meta: {} };
  let laterBotState = { meta: {} };
  let botOrganizationState = { meta: {} };
  let blockedState = { meta: {} };
  let notInterestedState = { meta: {} };
  const DEFAULT_SETTINGS = {};
  function readSettingsFromPage() { return {}; }
  function readSingleSettingFromPage() { return null; }
  function collectTrackedAvailabilityBots() { return []; }
  function runtimeMessageWithTimeout() { return Promise.resolve({ ok: false }); }
  function availabilitySourceLabel(source) { return source; }
  function reconcileBotUpdate(previous, next) { return { ...previous, ...next }; }
  function renderBotAvailability() { return 123; }
  function repairConfirmedUnavailableRecovery() { return Promise.resolve(); }
  let runtimeMessage = () => Promise.resolve({ ok: true });
`;

async function checkStartup(loadControllerFirst) {
  const listeners = {};
  const timers = [];
  const warnings = [];
  const document = {
    readyState: 'loading',
    head: { appendChild() {} },
    documentElement: { appendChild() {} },
    createElement() { return { id: '', textContent: '', className: '', style: {}, dataset: {} }; },
    addEventListener(type, callback) { listeners[type] = callback; },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: { get(keys, callback) { callback({}); } },
      onChanged: { addListener() {} }
    }
  };
  let clock = 0;
  const sandbox = {
    window: {}, document, chrome, Promise, Date, Object, Set, Map,
    console: { warn(...args) { warnings.push(args.map(String).join(' ')); } },
    setTimeout(fn, ms) { timers.push({ fn, ms }); return ++clock; },
    clearTimeout() {},
    requestAnimationFrame(fn) { timers.push({ fn, ms: 16 }); },
    MutationObserver: class { observe() {} }
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(source, context, { filename: 'shared/feature-registry.js' });
  assert.ok(Array.isArray(context.window.SpicyChatQoLFeatureRegistry));
  assert.equal(typeof listeners.DOMContentLoaded, 'function', 'startup should wait for the final Settings scripts');
  assert.equal(timers.length, 0, 'registry must not schedule startup while scripts are still loading');
  if (loadControllerFirst) vm.runInContext(controllerState, context);
  document.readyState = 'interactive';
  listeners.DOMContentLoaded();
  if (!loadControllerFirst) {
    assert.equal(timers.filter(x => x.ms === 50).length, 1, 'late controller should retry, not throw');
    vm.runInContext(controllerState, context);
    const next = timers.shift();
    assert.equal(next.ms, 50);
    next.fn();
  }
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(vm.runInContext('renderBotAvailability()', context), 123, 'Bot Status renderer should remain usable');
  assert.equal(warnings.length, 0, `unexpected startup warnings: ${warnings.join('; ')}`);
}

(async () => {
  await checkStartup(false);
  await checkStartup(true);
  console.log('Options enhancements start safely both before and after controller initialization.');
})().catch(error => { console.error(error); process.exitCode = 1; });
