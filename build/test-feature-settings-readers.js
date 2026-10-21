'use strict';
// Checks independent Settings reader registration and absence when a panel is omitted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const features = {
  'model-quick-access': ['enableModelQuickAccess','modelQuickAccessNames'],
  'chat-lorebook-manager': ['enableChatLorebookManager'],
  'previously-chatted-indicator': ['enablePreviouslyChattedIndicator','chattedIndicatorShowOpened'],
};
function run(id, included) {
  const values = {};
  const mockNode = () => ({ append() {}, replaceWith() {}, setAttribute() {}, className:'', id:'', value:'', checked:false });
  const document = {
    createElement: mockNode,
    getElementById: key => key === `ds-feature-panel-${id}` ? mockNode() : values[key] || null,
  };
  const window = { __DSQ_BUILD_PROFILE__: {generated:true,features:included?[id]:[]} };
  vm.runInNewContext(fs.readFileSync(path.join(root,'settings','feature-panels',`${id}.js`),'utf8'), { document,window });
  const readers=window.__DSQ_FEATURE_SETTINGS_READERS__ || {};
  if (!included) {
    assert.equal(Object.keys(readers).length,0,`${id}: omitted feature registered Settings readers`);
    return;
  }
  assert.deepEqual(Object.keys(readers).sort(),features[id].slice().sort());
  for (const key of features[id]) {
    values[key] = { checked:true, value:'Model One\nModel Two' };
    assert.equal(readers[key](),key==='modelQuickAccessNames'?'Model One\nModel Two':true);
    values[key] = { checked:false, value:'' };
    assert.equal(readers[key](),key==='modelQuickAccessNames'?'':false);
  }
}
for (const id of Object.keys(features)) { run(id,true);run(id,false); }
const autosave=fs.readFileSync(path.join(root,'settings/features/options-settings-autosave.js'),'utf8');
assert.match(autosave,/__DSQ_FEATURE_SETTINGS_READERS__/);
for (const keys of Object.values(features)) for(const key of keys) {
  assert.doesNotMatch(autosave,new RegExp(`case "${key}"`),`${key}: still coupled to shared granular Settings switch`);
  assert.doesNotMatch(autosave,new RegExp(`^\\s+${key}: checked\\(`,'m'),`${key}: still coupled to shared page reader`);
}
console.log('PASS: owned Settings readers and missing-feature behavior');
