'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const rows = new Map();
for (const id of ['showChatSearch','showOocTools','showChatExportButton','enableBotOrganizer']) {
  const row = { hidden: false, classList: { toggle(name,flag) { assert.equal(name,'ds-lite-omitted-setting');row.hidden=flag; } } };
  rows.set(id,{ checked:true, row, closest:()=>row });
}
const parent={ prepend(node){ this.notice=node; }};
const document={
 readyState:'complete',
 getElementById(id){return rows.get(id)||null;},
 querySelector(name){return name === 'main'?parent:null;},
 createElement(tag){return {tagName:tag,className:'',textContent:''};}
};
const window={
 __DSQ_BUILD_PROFILE__:{generated:true,features:['chat-search'],bundles:['core','interface','chat']},
 SpicyChatQoLFeatureRegistry:[
  {id:'chat-search',setting:'showChatSearch'},
  {id:'ooc-presets',setting:'showOocTools'},
  {id:'chat-export',setting:'showChatExportButton'},
  {id:'bot-organizer',setting:'enableBotOrganizer'}
 ]
};
const context=vm.createContext({window,document,console});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../settings/options-feature-availability.js'),'utf8'),context);
assert.equal(rows.get('showChatSearch').row.hidden,false);
assert.equal(rows.get('showOocTools').row.hidden,true);
assert.equal(rows.get('showChatExportButton').row.hidden,true);
assert.equal(rows.get('enableBotOrganizer').row.hidden,true);
assert([...rows.values()].every(v=>v.checked),'Omitted features must not be unchecked');
assert(parent.notice.textContent.includes('3 known feature controls hidden'));
console.log('PASS Settings: feature-specific visibility, absent feature controls hidden, saved values untouched');
