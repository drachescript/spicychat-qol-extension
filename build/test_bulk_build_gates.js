'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
function run(file,ctx){return vm.runInContext(fs.readFileSync(path.join(ROOT,file),'utf8'),ctx,{filename:file});}
const background=vm.createContext({console});
run('background/feature-build-profile.js',background);
run('background/feature-message-ownership.js',background);
assert(background.dsqBackgroundMessageAllowed('DS_DEEPL_TRANSLATE'));
assert(background.dsqBackgroundMessageAllowed('DS_GET_DIAGNOSTIC_CONTEXT'));
const map=vm.runInContext('DSQ_BACKGROUND_MESSAGE_OWNERS',background);
const source=fs.readFileSync(path.join(ROOT,'background/events/runtime-messages.js'),'utf8');
const names=[...source.matchAll(/message\?\.type\s*===\s*"([A-Z0-9_]+)"/g)].map(m=>m[1]);
for(const name of names) assert(map[name],`Unmapped background message: ${name}`);
assert.equal(Object.keys(map).length,new Set(names).size);
vm.runInContext('DSQ_BACKGROUND_BUILD_PROFILE.features = ["ooc"]',background); // Frozen: assignment should fail, do not mutate Full.
assert(background.dsqBackgroundMessageAllowed('DS_DEEPL_TRANSLATE'));
// Custom profile is substituted into the actual service profile file by the generator.
const sourceProfile=fs.readFileSync(path.join(ROOT,'background/feature-build-profile.js'),'utf8');
const custom=vm.createContext({console});
vm.runInContext(sourceProfile.replace('id: "full", features: null','id: "lite", features: ["ooc"]'),custom);
run('background/feature-message-ownership.js',custom);
assert.equal(custom.dsqBackgroundMessageAllowed('DS_DEEPL_TRANSLATE'),false);
assert.equal(custom.dsqBackgroundMessageAllowed('DS_WIKI_FETCH'),false);
assert.equal(custom.dsqBackgroundMessageAllowed('DS_GET_DIAGNOSTIC_CONTEXT'),true);
const context=vm.createContext({window:{__DSQ_TAB_GATE__:{paused:false},__DSQ_BUILD_PROFILE__:{generated:true,features:['ooc'],bundles:['core','chat']},DragonScriptQoL:{state:{runtimePerformance:{},settings:{}}}},console});
run('content/feature-build-map.js',context);
const ds=context.window.DragonScriptQoL;
assert(ds.featureBuildProfile.allFeatureIds.length >= 109, 'All current feature IDs should remain registered');
for (const id of ['model-quick-access','chat-lorebook-manager','previously-chatted-indicator'])
  assert(ds.featureBuildProfile.allFeatureIds.includes(id), 'Missing new v0.2.53 feature '+id);
assert.equal(ds.featureBuildProfile.isTaskInstalled('OOC'),true);
assert.equal(ds.featureBuildProfile.isTaskInstalled('chat search'),false);
assert.equal(ds.featureBuildProfile.isTaskInstalled('bot organizer'),false);
assert.equal(ds.featureBuildProfile.isTaskInstalled('unknown core operation'),true);
run('content/runtime-kernel.js',context);
let seen=0;
(async()=>{
  const base={group:'chat',run:()=>{seen++;return true;},execute:fn=>fn()};
  await ds.runtimeKernel.runFeature({...base,name:'chat search'});
  await ds.runtimeKernel.runFeature({...base,name:'OOC'});
  assert.equal(seen,1,'Only selected OOC task executed');
  console.log('PASS feature-level build gating and background-message ownership contracts');
})().catch(e=>{console.error(e);process.exitCode=1;});
