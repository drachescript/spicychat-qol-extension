/* Run: node build/test-multitab-idle-guards.js
   Focused browser-independent checks; not a CPU benchmark or browser validation. */
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function verifyRoutePolling() {
  const state = {runtimePerformance: {}};
  let paused = false, hidden = true, routeChecks = 0, callback = null, observes = 0;
  const DS = {
    state,
    isQolPausedForTab: () => paused,
  };
  const document = {get hidden(){return hidden;},documentElement:{}};
  const context = {window:{DragonScriptQoL:DS},document,
    setInterval(fn,ms){if(ms!==2000)throw Error('Unexpected polling period');callback=fn;},
    MutationObserver:class{observe(){observes++}},
  };
  vm.runInNewContext(read('content/main-page-observer.js'), context, {timeout:1000});
  DS.installMainPageObserver({checkRouteChange(){routeChecks++;},runtimeCounters:()=>state.runtimePerformance});
  DS.observePage();
  if(!callback || observes!==1)throw Error('Page observer/polling not registered');
  callback();
  if(routeChecks!==0 || state.runtimePerformance.hiddenRoutePollSkips!==1)throw Error('Hidden route poll not skipped');
  hidden=false;callback();
  if(routeChecks!==1)throw Error('Visible route poll did not run');
  paused=true;callback();
  if(routeChecks!==1)throw Error('Paused tab still polled');
}
function verifySources() {
  const main = read('content/main.js');
  const perf = read('content/runtime-improvements.js');
  const reload = read('content/performance-mode.js');
  if(!main.includes('function scheduleSettledVisibleWake(source)') ||
     !main.includes('if (!document.hidden) scheduleSettledVisibleWake("pageshow")') ||
     !main.includes('scheduleSettledVisibleWake("visible")') ||
     !main.includes('clearTimeout(visibleWakeTimer)')) throw Error('Visible wake debounce wiring incomplete');
  if(!perf.includes('if (document.hidden && !DS.state?.qolBackgroundWorker)'))
    throw Error('Hidden automatic performance snapshot guard missing');
  if(!reload.includes('if (document.hidden) return;'))
    throw Error('Hidden automatic reload guard missing');
}
verifyRoutePolling(); verifySources();
console.log('PASS: hidden/visible/paused route polling; wake/reload/pressure guard wiring');
