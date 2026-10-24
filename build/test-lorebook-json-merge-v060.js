'use strict';
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict'), path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../content/lorebook-backup.js'),'utf8');
const between=(a,b)=>{const start=src.indexOf(a),end=src.indexOf(b,start+a.length);assert(start>=0&&end>start,`not found: ${a}`);return src.slice(start,end);};
const context=vm.createContext({Date,Math,Set,Map,Object,String,Array,RegExp,Number,Error});
vm.runInContext(between('  function clean(value, max = 24000) {','  function selectedChipTexts(')+between('  function parseLorebookImportPayload(raw) {','  function createCloneToken() {'),context);
const parse=payload=>vm.runInContext(`parseLorebookImportPayload(${JSON.stringify(payload)})`,context);
assert.throws(()=>parse({entries:[{name:'Same',content:'one'},{name:'same',content:'two'}]}),/duplicate entry names/);
assert.throws(()=>parse({entries:[{name:'A'.repeat(51),content:'one'},{name:'A'.repeat(50)+'B',content:'two'}]}),/duplicate entry names/);
assert.equal(parse({entries:[{name:'One',content:'text'}]}).entries.length,1);
// Private-owner verification must refuse public/foreign Lorebooks.
const verify=between('  async function verifyPrivateImportTarget(id) {','  async function startExistingLorebookMerge(file) {');
const id='01234567-89ab-cdef-0123-456789abcdef';
const run=async (book,userId='owner')=>{
 const ctx=vm.createContext({Error,UUID_RE:/^[0-9a-f-]{36}$/i,DS:{privateLorebookAuth:{request:async route=>route==='/v2/users'?{user:{id:userId}}:book}}});
 vm.runInContext(verify,ctx);return vm.runInContext(`verifyPrivateImportTarget('${id}')`,ctx);
};
(async()=>{
 assert.equal((await run({id,creator_user_id:'owner',visibility:'private'})).visibility,'private');
 await assert.rejects(run({id,creator_user_id:'other',visibility:'private'}),/only a private/i);
 await assert.rejects(run({id,creator_user_id:'owner',visibility:'public'}),/only a private/i);
 await assert.rejects(run({id:'different',creator_user_id:'owner',visibility:'private'}),/only a private/i);
 for(const expected of ['Add missing tags','Upload cover from JSON','Merge full JSON into this Lorebook',
  'Keep existing entries (recommended)','Merge matching entries','Replace matching entries',
  'Select JSON tags in SpicyChat','verifyPrivateImportTarget(info.id)','offerQueuedEntryImport(info)',
  'getCurrentOwnLorebookBackupData(info.id)','entryCountVerified !== true'])
  assert(src.includes(expected),`missing UI or safeguard: ${expected}`);
 assert(src.includes('document.activeElement !== input'), 'native tag fallback must require focused input');
 assert(src.includes("button[value],button[aria-label]"), 'native value/aria-label picker fallback unavailable');
 assert(src.includes('data-field-name="avatar_url"'), 'cover preview must use native field');
 assert(!src.includes('maybeRunPendingLorebookImport'), 'import should not auto-retry on navigation');
 console.log('PASS: duplicate entry guards, private target verification, native tag/cover UI, explicit merge/entry-only review');
})().catch(error=>{console.error(error);process.exitCode=1;});
