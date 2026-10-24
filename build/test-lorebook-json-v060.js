'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = require('node:path').resolve(__dirname,'..');
const file=fs.readFileSync(root+'/content/lorebook-backup.js','utf8');
const workflow=fs.readFileSync(root+'/content/lorebook-workflow.js','utf8');
function slice(from,to) {
  const a=file.indexOf(from), b=file.indexOf(to,a+from.length);
  assert(a>=0 && b>a, 'missing function section '+from);
  return file.slice(a,b);
}
const helper=slice('  function clean(value, max = 24000) {','  function selectedChipTexts(');
const parsing=slice('  function parseLorebookImportPayload(raw) {','  function createCloneToken() {');
const context=vm.createContext({Date,Math,Set,Map,Object,String,Array,RegExp,Number,Error});
vm.runInContext(helper+parsing,context);
const parse=raw=>vm.runInContext('parseLorebookImportPayload('+JSON.stringify(raw)+')',context);
const legacy=parse({format:'spicychat-qol-lorebook-backup',lorebook:{id:'original',name:'My Lorebook',description:'Backstory',image:'avatars/old.png',visibility:'private',tags:['Magic','Story'],entries:{a:{name:'A',content:'Entry A',keywords:['Apple']}}}});
assert.equal(legacy.name,'My Lorebook');assert.equal(legacy.description,'Backstory');assert.equal(legacy.entries.length,1);
assert.equal(legacy.tags.length,2);assert.equal(legacy.image,'avatars/old.png');
const recovery=parse({schema:'spicychat-qol-lorebook-recovery-copy',lorebook:{id:'id',name:'Full',description:'Details',avatar_url:'cdn/avatar.webp',tags:['fantasy']},entries:[{name:'One',content:'Content',keywords:['one']},{name:'Two',content:'Other',keywords:['two']}]});
assert.equal(recovery.entries.length,2); assert.equal(recovery.entries[1].name,'Two');
const imageData='data:image/png;base64,'+Buffer.from('image').toString('base64');
assert.equal(parse({lorebook:{name:'Image',entries:[]},imageData}).imageData,imageData);
assert.throws(()=>parse({lorebook:{name:'Broken',entries:[{name:'Oops',content:''}]}}),/Only 0\/1 entries/);
assert.throws(()=>parse({lorebook:{name:'Oversize',entries:Array.from({length:5001},()=>({name:'x',content:'y'}))}}),/5,000/);
assert.throws(()=>parse({lorebook:{entries:[]},imageData:'data:image/svg+xml;base64,AAA='}),/not a supported/);
assert(file.includes('getCurrentOwnLorebookBackupData(info.id)'), 'download no longer uses complete live reader');
assert(file.includes('entryCountVerified !== true'), 'full export needs complete entry count');
assert(file.includes('downloadSavedCopy()'), 'missing immediate local fallback');
assert(file.includes('putCloneCoverInNativeUploader'), 'missing native cover handoff');
assert(file.includes('renderCloneImportButton'), 'missing direct Create Lorebook JSON entry point');
assert(file.includes('imageDataForBackup(item.image || "")'), 'download should attempt optional cover embedding');
assert(file.includes('book?.creator_user_id !== owner || book?.visibility !== "private"'), 'clone lacks private/ownership check');
assert(file.includes('cloneRecord().')===false, 'avoid unguarded record assumptions');
assert(!file.includes('await api("/lorebooks", "POST"'), 'private clone must use manual native create');
assert(workflow.includes('const modal = await openRow(liveRows[index])'), 'full fallback must reopen entries');
assert(!workflow.slice(workflow.indexOf('DS.captureLorebookEntriesFully ='),workflow.indexOf('DS.applyLorebookWorkflowTools =')).includes('const data = await captureRow(rows[index]);'), 'full fallback still uses cached entry analysis');
// The optional cover embed must not fetch arbitrary attacker-controlled URLs.
(async()=>{
  const embedSource=slice('  let lastCoverError = "";','  async function exportCurrent() {');
  const sent=[];
  const ctx=vm.createContext({
    URL, Date, Array, Uint8Array, Number, String, Set, Promise,
    location:{origin:'https://spicychat.ai'}, setTimeout,clearTimeout,
    chrome:{runtime:{sendMessage(message,callback) {
      sent.push(message);callback({ok:true,dataUrl:'data:image/png;base64,AQIDBA=='});
    },get lastError(){return undefined;}}}
  });
  vm.runInContext(embedSource,ctx);
  const invoke=async x=>vm.runInContext('imageDataForBackup('+JSON.stringify(x)+')',ctx);
  assert.equal(await invoke('https://evil.example/avatar.png'),'');
  assert.equal(sent.length,0);
  assert.equal(await invoke('avatars/good.png'),'data:image/png;base64,AQIDBA==');
  assert.equal(sent.length,1);
  assert.equal(sent[0].url,'https://cdn.nd-api.com/avatars/good.png');
  assert.equal(await invoke('data:image/jpeg;base64,YQ=='),'data:image/jpeg;base64,YQ==');
  assert.equal(sent.length,1);
  assert.equal(await invoke('https://cdn.nd-api.com/avatars/good.png?class=avatar256x256'),'data:image/png;base64,AQIDBA==');
  assert.equal(await invoke('https://cdn.nd-api.com/avatars/good.png?class=other'),'');
  assert.equal(sent.length,2);
  console.log('PASS: legacy/recovery JSON, full details, invalid data guards, private clone checks, current export, fresh entry capture, and safe first-party picture embedding');
})().catch(error=>{console.error(error);process.exitCode=1;});
