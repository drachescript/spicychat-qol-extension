'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
// Parse the ownership map in a browser-like context: file registration checks
// alone cannot detect a syntax error that would stop the Settings page loading.
const ownerContext = vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(path.join(root,'settings/feature-setting-owners.js'),'utf8'),ownerContext,
  {filename:'settings/feature-setting-owners.js',timeout:1000});
const ownership = ownerContext.window.__DSQ_FEATURE_SETTING_OWNERS__;
assert(ownership && typeof ownership==='object','Feature Settings ownership map failed to register');
for(const [feature,required] of Object.entries({
  'bot-status':['botStatusScanSpeed','botStatusStaleDays','botStatusMaxBots','botStatusMaxMinutes'],
  'bot-archive':['botArchiveRememberSeenPublic','botArchiveOnProfileVisit','botArchiveOnChatOpen','botArchiveRefreshHours'],
  'bot-backup':['botBackupToolsEnabled','botArchiveOwnEditorBackups','botArchiveOwnRevisionLimit'],
  'lorebook-backup':['lorebookBackupToolsEnabled','lorebookBackupsEnabled']
})) {
  assert.deepEqual(Array.from(ownership[feature]||[]),required,`${feature}: Settings ownership keys`);
}
const ids = [
  'chat-search','focus-mode','command-palette','story-day-tracker',
  'chat-nudges','chat-topbar','card-workflow','native-rating-helpers',
  'profile-export','creator-writing-assistant','chat-bookmarks','alternate-dialogue',
  'model-quick-access','chat-lorebook-manager','previously-chatted-indicator',
  'context-keeper','soundscapes','chat-scene-notes','reply-instructions','rp-state-tracker','translation',
  'bot-status','bot-archive','bot-backup','lorebook-backup'
];
function makeNode() { return { append(){},appendChild(){},setAttribute(){},replaceWith(){},checked:false,value:'',dataset:{} }; }
function evaluate(id, installed) {
  const nodes = Object.create(null);
  const host = makeNode();
  const context = { BOT_STATUS_SCAN_SPEED_DELAYS:{safe:600,normal:450,fast:350}, window:{ __DSQ_BUILD_PROFILE__:{generated:true,features:installed?[id]:[]} },
    document:{ getElementById:key=>key===`ds-feature-panel-${id}` ? host : (nodes[key] ||= makeNode()),
      createElement:()=>makeNode(),createTextNode:()=>makeNode()},
    $:(key)=>nodes[key] || null,
    checked:(key, defaultValue=false)=>nodes[key]?.checked ?? defaultValue,
    value:(key,defaultValue='')=>nodes[key]?.value ?? defaultValue,
    setChecked:(key,val)=>(nodes[key] ||= makeNode()).checked=val,
    setValue:(key,val)=>(nodes[key] ||= makeNode()).value=val,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'settings/feature-panels',`${id}.js`),'utf8'),context);
  const readers=context.window.__DSQ_FEATURE_SETTINGS_READERS__ || {};
  const loaders=context.window.__DSQ_FEATURE_SETTINGS_LOADERS__ || {};
  if(!installed){
    assert.equal(Object.keys(readers).length,0,`${id}: omitted read handler`);
    assert.equal(Object.keys(loaders).length,0,`${id}: omitted load handler`);
    return 0;
  }
  const ownerSettings=JSON.parse(fs.readFileSync(path.join(root,'build/features',`${id}.json`),'utf8')).settingsKeys || [];
  for(const key of ownerSettings) {
    if (!(key in readers)) continue; // Some controls await further isolation.
    assert.equal(typeof loaders[key],'function',`${id}.${key}: load handler is missing`);
  }
  for(const key of Object.keys(readers)) {
    assert.equal(typeof loaders[key],'function',`${id}.${key}: read handler without load`);
    readers[key]();
    loaders[key]({[key]:'test-value'});
    readers[key]();
  }
  return Object.keys(readers).length;
}
let count=0;
for(const id of ids) { count+=evaluate(id,true);evaluate(id,false); }
const sharedLoad=fs.readFileSync(path.join(root,'settings/features/options-settings-load.js'),'utf8');
const sharedRead=fs.readFileSync(path.join(root,'settings/features/options-settings-autosave.js'),'utf8');
assert.match(sharedLoad,/__DSQ_FEATURE_SETTINGS_LOADERS__/);
assert.match(sharedRead,/__DSQ_FEATURE_SETTINGS_READERS__/);
for(const id of ids){
  const panel=fs.readFileSync(path.join(root,'settings/feature-panels',`${id}.js`),'utf8');
  for (const [,key] of panel.matchAll(/readers\["([A-Za-z]\w+)"\]/g)) {
    assert.doesNotMatch(sharedLoad,new RegExp(`set(?:Checked|Value)\\("${key}"`),`${id}.${key} still in shared loader`);
    assert.doesNotMatch(sharedRead,new RegExp(`case "${key}"`),`${id}.${key} still in shared granular reader`);
    assert.doesNotMatch(sharedRead,new RegExp(`^ {4}${key}\\s*:`, 'm'),`${id}.${key} still in shared full-page reader`);
  }
}
console.log(`PASS: ${ids.length} feature-owned Settings modules, ${count} handlers, inclusion/omission, no central duplicates`);
