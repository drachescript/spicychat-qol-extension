"use strict";
// Tests the new Full-first scheduler lifecycle independently of SpicyChat DOM.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert").strict;
const ROOT = path.resolve(__dirname, "..");
const calls = [];
const backing = { state: { settings: { enabled: true }, runtimePerformance: {} }, runtimeLog: () => {} };
const DS = new Proxy(backing, {
  get(target, prop) {
    if (prop in target) return target[prop];
    if (typeof prop === "string" && /^(remove|apply|hide|unhide|update|set|restore)/.test(prop)) return () => { calls.push(prop); };
    return undefined;
  }
});
const context = vm.createContext({
  window: { DragonScriptQoL: DS, __DSQ_TAB_GATE__: { paused: false } },
  document: { documentElement: {}, getElementById: () => null },
  console,
});
for (const file of ["content/runtime-kernel.js", "content/feature-lifecycle.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file });
}
(async () => {
  const lifecycle = DS.featureLifecycle;
  assert(lifecycle, "Lifecycle module installed");
  assert(lifecycle.hasCleanup("OOC"));
  assert(lifecycle.hasCleanup("chat search"));
  assert(!lifecycle.hasCleanup("new unknown feature"));
  let runs = 0;
  const enabled = () => ({name:"OOC", group:"chat", wanted:true, run:()=>{runs++;}, execute: fn=>fn()});
  await DS.runtimeKernel.runFeature(enabled());
  assert.equal(runs, 1);
  assert.equal(lifecycle.activeFeatures().includes("OOC"), true);
  await DS.runtimeKernel.runFeature({...enabled(), wanted:false});
  assert.equal(runs, 1, "No disabled work executed");
  assert.equal(calls.filter(x=>x === "removeOocTools").length, 1);
  await DS.runtimeKernel.runFeature({...enabled(), wanted:false});
  assert.equal(calls.filter(x=>x === "removeOocTools").length, 1,"No duplicate stop");
  await DS.runtimeKernel.runFeature(enabled());
  await lifecycle.reconcileSettings(new Set(["showOocTools"]), {enabled:true,showOocTools:false,replaceChatImageWithOocButton:false,quickPanelShowOoc:true});
  assert.equal(lifecycle.activeFeatures().includes("OOC"),true,"Other enabled OOC route retains feature");
  await lifecycle.reconcileSettings(new Set(["quickPanelShowOoc"]), {enabled:true,showOocTools:false,replaceChatImageWithOocButton:false,quickPanelShowOoc:false});
  assert.equal(lifecycle.activeFeatures().includes("OOC"),false,"Last OOC setting disables feature");
  await DS.runtimeKernel.runFeature(enabled());
  await lifecycle.reconcileRoute({chat:false, bundleMask:1},()=>false);
  assert.equal(lifecycle.activeFeatures().length,0,"Leaving route terminates feature");
  assert.equal(calls.filter(x=>x === "removeOocTools").length,3);
  const original = fs.readFileSync(path.join(ROOT, 'content/feature-lifecycle.js'), 'utf8');
  const fullSteps = [...original.matchAll(/await runStep\("([^"]+)",/g)].map(x=>x[1]);
  assert(fullSteps.length >= 71,"Full shutdown retains the original cleanup steps");
  const shutdown = [];
  await lifecycle.shutdownAll({runStep:async(name,fn)=>{shutdown.push(name);await fn();},syncNativeScrollBackToTopVisibility:()=>shutdown.push("native-scroll-recovery")});
  assert.equal(shutdown.filter(x=>x !== 'native-scroll-recovery').length,fullSteps.length);
  assert.equal(shutdown[0],'remove disabled panel');
  assert.equal(shutdown.at(-1),'OOC cleanup');
  await lifecycle.shutdownAll({runStep:async()=>{throw Error('should not repeat');}});
  assert.equal(lifecycle.activeFeatures().length,0);
  console.log('PASS Full feature lifecycle: activation, single cleanup, settings, route, '+fullSteps.length+'-step ordered shutdown');
})().catch(err=>{console.error(err);process.exitCode=1;});
