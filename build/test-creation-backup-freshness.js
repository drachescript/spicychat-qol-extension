'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const bulk = fs.readFileSync(path.join(root, 'content/my-creations-backup.js'), 'utf8');
const editor = fs.readFileSync(path.join(root, 'content/lorebook-backup.js'), 'utf8');
const workflow = fs.readFileSync(path.join(root, 'content/lorebook-workflow.js'), 'utf8');

function sourceBetween(code, from, until) {
  const a = code.indexOf(from);
  const b = code.indexOf(until, a + from.length);
  assert(a >= 0 && b > a, `Cannot find ${from}`);
  return code.slice(a, b);
}

const fnText = sourceBetween(bulk, '  function equivalentVisibleText(', '  function botPortableJson(');
const context = {
  clean(value, max = 600) { return String(value ?? '').trim().slice(0, max); },
  Date, Number, String, RegExp, Error,
};
vm.createContext(context);
vm.runInContext(`${fnText}\nthis.compare=verifyAgainstOwnedList; this.editorVerify=verifyBotViaRenderedEditor;`, context);
const compare = context.compare;
assert.deepEqual(Array.from(compare({name: 'Hazel', title: 'A Strange First Meeting — Lopunny'}, {name:'Hazel',listedTitle:'A Strange First Meeting - Lopunny'})), []);
assert.deepEqual(Array.from(compare({name: 'Old Hazel', title: 'Old story'}, {name:'Hazel',listedTitle:'New story'})).length, 2);
assert.deepEqual(Array.from(compare({name: 'Hazel',title:'New story',updatedAt:'2026-10-20T09:00:00Z'}, {name:'Hazel',listedTitle:'New story',listedUpdatedAt:'2026-10-21T19:00:00Z'})).length, 1);
assert.equal(Array.from(compare({name:'Hazel'}, {name:'Hazel'})).length, 0, 'missing optional list fields must not become false stale failures');

const editorFn = sourceBetween(editor, '  async function captureCurrentLorebookThroughEditors(', '  DS.getCurrentOwnLorebookBackupDataFromEditor =');
const id = '01a15fc3-a288-7a16-b986-ea14c269c8bd';
let reads = [];
const storage = { historic: { name: 'Stale lorebook', entries: [{name:'Stale entry', content:'DO NOT EXPORT'}] } };
const ctx = {
  clean(value, max=24000){ return String(value ?? '').trim().slice(0,max); },
  unique(items=[], max=50) {return [...new Set(items)].slice(0,max);},
  Date, Number, Math, Error, Promise,
  currentEditorFallbackQueue: Promise.resolve(),
  async requestEditorPageCapture(wanted, target) {
    reads.push(target);
    assert.equal(wanted, id);
    if (target === 'details') return {id, page:'details', data:{name:'Fresh Lorebook',description:'Changed now',tags:['New tag']}};
    return {id, page:'entries', complete:true, data:[{name:'Fresh entry',keywords:['keyword'],content:'New content'}]};
  },
  DS: { storageGet(){throw Error('Historic store must never be read');}, storageSet(){throw Error('Historic store must never be written');} },
};
vm.createContext(ctx);
vm.runInContext(`${editorFn}\nthis.capture=captureCurrentLorebookThroughEditors;`, ctx);
(async () => {
  const snapshot = await ctx.capture(id);
  assert.equal(snapshot.lorebook.name,'Fresh Lorebook');
  assert.equal(snapshot.lorebook.description,'Changed now');
  assert.equal(snapshot.entries.length, 1);
  assert.equal(snapshot.entries[0].content,'New content');
  assert.equal(JSON.stringify(snapshot).includes('DO NOT EXPORT'),false);
  assert.deepEqual(reads,['details','entries']);
  assert.equal(snapshot.source, 'current-live-editor');
  assert.equal(snapshot.completeness.entries,true);
  ctx.requestEditorPageCapture = async (_id,target) => target==='details'
    ? {id,page:'details',data:{name:'Fresh Lorebook'}}
    : {id,page:'entries',complete:false,data:storage.historic.entries};
  await assert.rejects(ctx.capture(id),/complete fresh entry list/);
  assert.match(editor,/job\.capture.*job\.id.*safeId/s);
  assert.match(editor,/Serialize progress writes/);
  assert.match(workflow,/entries\.length !== rows\.length/);
  assert.match(bulk,/lorebook.*live listing/i);
  assert.match(bulk,/snapshot = await verifyBotViaRenderedEditor\(snapshot, item\)/);
  const ownerId = '01a15fc3-a288-7a16-b986-ea14c269c8bd';
  context.runtimeMessage = async request => {
    assert.equal(request.type, 'DS_BOT_EXPORT_HELPER');
    return {ok:true,id:ownerId, tagCount:0, capturedAt:Date.now(),
      present:{name:true,title:true,greeting:true,personality:true,scenario:true,exampleDialogues:true},
      fields:{name:'Hazel',title:'New title',greeting:'Updated greeting',personality:'Updated persona',scenario:'',exampleDialogues:'',tags:''}};
  };
  const verified = await context.editorVerify({id:ownerId,name:'Old Hazel',title:'Old title',tags:['Old tag']},{id:ownerId,name:'Hazel',listedTitle:'New title'});
  assert.equal(verified.title,'New title');
  assert.equal(verified.greeting,'Updated greeting');
  assert.equal(verified.personality,'Updated persona');
  assert.equal(verified.tags.length,0,'explicit zero-tag editor selection overrides stale API tags');
  assert.equal(verified.ownerEditorVerified,true);
  assert.match(verified.source,/rendered-owner-editor/);
  context.runtimeMessage = async () => ({ok:false,error:'helper unavailable'});
  await assert.rejects(context.editorVerify({id:ownerId},{id:ownerId}),/verification failed/);
  context.runtimeMessage = async () => ({ok:true,id:ownerId,tagCount:0,present:{name:true,title:true},fields:{name:'Wrong bot',title:'Wrong title',tags:''}});
  await assert.rejects(context.editorVerify({id:ownerId},{id:ownerId,name:'Hazel'}),/name differs/);
  assert.match(fs.readFileSync(path.join(root,'background/features/background-bot-export.js'),'utf8'),/queueFreshBotEditor/);
  assert.match(fs.readFileSync(path.join(root,'content/bot-backup.js'),'utf8'),/captureCurrentEditorForExport/);
  console.log('PASS: owner metadata mismatch/retry guards, independent editor-only Lorebook capture, stale-data rejection, incomplete capture');
})().catch(error => {console.error(error);process.exitCode=1;});
