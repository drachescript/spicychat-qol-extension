'use strict';
// Read-only private Lorebook audit regression checks. No network or writes.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'content/private-lorebook-bridge.js'),'utf8');
const begin=source.indexOf('  function inspectPendingNativeRecords(');
const finish=source.indexOf('  async function createEntry(',begin);
assert(begin>=0&&finish>begin,'native audit helper missing');
const ctx=vm.createContext({
  UUID:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  norm:(v,n=2000)=>String(v??'').replace(/\u00a0/g,' ').trim().slice(0,n)
});
vm.runInContext(source.slice(begin,finish)+'\nthis.audit=inspectPendingNativeRecords;',ctx);
const audit=ctx.audit;
const bookId='11111111-1111-4111-8111-111111111111';
const entryId='22222222-2222-4222-8222-222222222222';
const details=new Map([['fact1',{id:'fact1',text:'Vera protects the gate.',enabled:true,needsReview:false}]]);
const record={detailId:'fact1',sourceText:'Vera protects the gate.',name:'Gatekeeper Vera',content:'Vera protects the gate.',keywords:['Vera','North gate'],native:{status:'pending',bookId}};
const remote={id:entryId,name:record.name,content:record.content,keywords:['North gate','Vera']};
const book={id:bookId,num_entries:1,entries:[remote]};
const plain=x=>JSON.parse(JSON.stringify(x));
let result=plain(audit([record],book,details));
assert.equal(result.pending,1);assert.equal(result.exactCandidates,1);assert.equal(result.complete,true);
assert.equal(result.notFound,0);assert.equal(result.ambiguous,0);
// Absent/partial/duplicate entry counts are not certified complete.
for(const altered of [
  {...book,num_entries:null}, {...book,num_entries:2}, {...book,num_entries:undefined},
  {...book,num_entries:2,entries:[remote,remote]},
]){
  result=plain(audit([record],altered,details));
  assert.equal(result.complete,false);assert.equal(result.exactCandidates,0);
  assert.equal(result.unverifiedPage,1);
}
result=plain(audit([record],{...book,entries:[{...remote,content:'Changed text'}]},details));
assert.equal(result.conflicts,1);assert.equal(result.exactCandidates,0);
result=plain(audit([record],{...book,entries:[{...remote,keywords:null}]},details));
assert.equal(result.unreadableKeywords,1);assert.equal(result.exactCandidates,0);
result=plain(audit([record],{...book,entries:[{...remote,id:'invalid'}]},details));
assert.equal(result.complete,false);
result=plain(audit([record],book,new Map([['fact1',{...details.get('fact1'),needsReview:true}]])));
assert.equal(result.sourceChanged,1);assert.equal(result.exactCandidates,0);
result=plain(audit([{...record,native:{status:'handoff',bookId}}],book,details));
assert.equal(result.exactCandidates,1);
result=plain(audit([{...record,native:{status:'pending',bookId,id:entryId}}],book,details));
assert.equal(result.pending,0);
result=plain(audit([record,{...record,detailId:'fact2',sourceText:'Another fact',native:{status:'pending',bookId}}],book,new Map([...details,['fact2',{id:'fact2',text:'Another fact',enabled:true}]])));
assert.equal(result.exactCandidates,0);assert.equal(result.ambiguous,2);
// Recovery planner must not certify a page when num_entries is unknown.
const recovery=fs.readFileSync(path.join(root,'content/private-lorebook-recovery.js'),'utf8');
const rCtx=vm.createContext({window:{__DSQ_TAB_GATE__:null,DragonScriptQoL:{}},Date});
vm.runInContext(recovery,rCtx);
const plan=rCtx.window.DragonScriptQoL.privateLorebookRecovery.plan;
const rScope={botId:'33333333-3333-4333-8333-333333333333',conversationId:'44444444-4444-4444-8444-444444444444'};
for(const num of [null,undefined,2]){
  const p=plan({id:bookId,num_entries:num,entries:[]},[],rScope);
  assert.equal(p.stats.complete,false);
}
const expected=source.slice(source.indexOf('  function inspectArchiveRecords('),source.indexOf('  function archiveAuditSummary('));
assert(expected.includes('entries.length === expectedCount'));
assert(expected.includes('Number.isSafeInteger(expectedCount)'));
assert(!source.includes('await local.put(' + "{...record,native:{id:matches"));
console.log('PASS: native pending read-only matching, partial/duplicate safeguards, Archive completeness checks');
