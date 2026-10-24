'use strict';
const fs=require('node:fs'), path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'content/private-lorebook-bridge.js'),'utf8');
const a=source.indexOf('  async function syncArchive('),b=source.indexOf('  async function show()',a);
assert(a>0&&b>a);
const uuidA='11111111-1111-4111-8111-111111111111',uuidB='22222222-2222-4222-8222-222222222222';
const scope={botId:'33333333-3333-4333-8333-333333333333',conversationId:'44444444-4444-4444-8444-444444444444'};
const record={accountId:'owner',botId:scope.botId,conversationId:scope.conversationId,detailId:'fact1',sourceText:'A fact',content:'A fact',keywords:['Vera'],name:'Vera'};
let remote,postCount=0,localWrites=0,prepares=0;
const ctx=vm.createContext({
  Date,UUID:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  sameRoute:()=>true, requireCurrentReviewedFact:async()=>{},verifyBot:async()=>({accountId:'owner',bookId:uuidB}),
  verifyArchive:async()=>remote,
  recovery:{parse:(row)=>row.detailId?{detailId:row.detailId}:null,packageEntry:()=>'{"schema":"v2"}'},
  local:{list:async()=>[],put:async(row)=>{localWrites++;return row;}},
  DS:{privateLorebookAuth:{entryCreateSupported:true,prepareEntryCreate:async()=>{prepares++;return 'approved';},createEntry:async()=>{postCount++;return {id:uuidA,lorebookId:uuidB,version:1};}}},
  confirm:()=>true
});
vm.runInContext(source.slice(a,b)+'\nthis.syncArchive=syncArchive;',ctx);
(async()=>{
  const run=()=>ctx.syncArchive('owner',scope,record,{id:uuidB},false);
  remote={id:uuidB,num_entries:2,entries:[]};
  await assert.rejects(run(),/incomplete/);
  remote={id:uuidB,num_entries:1,entries:[{id:uuidA,detailId:'fact1'}]};
  await assert.rejects(run(),/already appears/);
  remote={id:uuidB,num_entries:2,entries:[{id:uuidA},{id:uuidA}]};
  await assert.rejects(run(),/incomplete/);
  assert.equal(postCount,0);assert.equal(prepares,0);assert.equal(localWrites,0);
  remote={id:uuidB,num_entries:0,entries:[]};
  const result=await run();
  assert.equal(result.remote.status,'confirmed');
  assert.equal(postCount,1);assert.equal(prepares,1);assert.equal(localWrites,2);
  assert(source.includes('if(!newest.stats.complete)'), 'second readback reconciliation check missing');
  assert(source.includes('if(!stats.complete)'), 'initial readback reconciliation check missing');
  console.log('PASS: Archive incomplete/duplicate reads block POST; unique complete list permits approved path');
})().catch(error=>{console.error(error);process.exitCode=1;});
