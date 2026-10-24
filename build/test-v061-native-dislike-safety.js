#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'background/features/background-feedback-history.js'),'utf8');
const a=source.indexOf('async function submitQuickDislikeUsingNativeUi(');
const b=source.indexOf('// Optional alarm handler owned by bot-blocking.', a);
assert(a>=0 && b>a,'native dislike flow not found');
const botId='a3f2ddc0-9779-4b37-8b8a-fad4aff6460a';
const exampleChat=`https://spicychat.ai/chat/${botId}/087b52d6-2825-4aeb-a1af-0d8195d55b31`;
function scenario({historyEntry=null, nativeResponse={ok:true,status:'disliked',nativeUiConfirmed:true,requestSent:true}, workerPrepared=true}={}){
 let sends=[], writes=[], preps=[], olderApiCalls=0;
 const context={
  console,URL,Date,Math,setTimeout,clearTimeout,
  isSpicyChatUrl: url=>new URL(url).origin==='https://spicychat.ai',
  prepareQuickDislikeWorkerTab: async (url, runId, job)=>{preps.push({url:url.href,runId,job});return workerPrepared?{ok:true,tabId:99}:{ok:false}},
  isQuickDislikeBulkRunCanceled:()=>false,
  tabsGet: async()=>({id:99}),
  tabsSendMessageWithTimeout:async (_tabId,msg)=>{sends.push(msg);return msg.type==='DS_GET_PAGE_INFO'?{ok:true,isSingleChatPage:true,botId}:nativeResponse},
  getQuickDislikeHistory:async()=>({bots:historyEntry?{[botId]:historyEntry}:{}}),
  feedbackUnavailableSuperseded:async()=>false,
  rememberQuickDislike:async (_id,_name,status,origin)=>{writes.push({status,origin});return {handledAt:1,ratingAt:1}},
  recordHelperLifecycle:async()=>{},
  runDirectCharacterFeedback:()=>{olderApiCalls++;throw Error('synthetic API path must never be called')}
 };
 vm.createContext(context);
 vm.runInContext(`${source.slice(a,b)}\nthis.run=runQuickDislikeBot;`,context);
 return {ctx:context,sends,writes,preps,run:message=>context.run({botId,chatUrl:exampleChat,botName:'Example',...message}),get olderApiCalls(){return olderApiCalls}};
}
(async()=>{
 const good=scenario();
 const result=await good.run();
 assert.equal(result.ok,true);assert.equal(result.status,'disliked');
 assert.equal(result.executor,'native-chat-rating-worker');
 assert.equal(good.sends.filter(m=>m.type==='DS_QUICK_DISLIKE_RUN').length,1);
 assert.equal(good.writes.length,1);
 assert.equal(good.writes[0].origin.nativeUiConfirmed,true);
 assert.equal(good.olderApiCalls,0);
 const legacy=scenario({historyEntry:{status:'disliked',nativeEventConfirmed:true,handledAt:50}});
 assert.equal((await legacy.run()).ok,true,'an API-only legacy Dislike must be reverified');
 assert.equal(legacy.sends.some(m=>m.type==='DS_QUICK_DISLIKE_RUN'),true);
 const known=scenario({historyEntry:{status:'disliked',nativeUiConfirmed:true,handledAt:50}});
 const knownResult=await known.run();
 assert.equal(knownResult.status,'already-handled'); assert.equal(known.sends.length,0);
 const uncertain=scenario({nativeResponse:{ok:true,status:'disliked',nativeUiConfirmed:false}});
 const uncertainResult=await uncertain.run();
 assert.equal(uncertainResult.ok,false); assert.equal(uncertainResult.status,'native-rating-unverified');
 assert.equal(uncertain.writes.length,0);
 const failed=scenario({nativeResponse:{ok:false,status:'rating-modal-not-found'}});
 assert.equal((await failed.run()).ok,false);assert.equal(failed.writes.length,0);
 const unavailable=scenario({workerPrepared:false});
 assert.equal((await unavailable.run()).status,'native-rating-worker-unavailable');
 assert.equal(unavailable.writes.length,0);
 const wrongUrl=scenario();
 assert.equal((await wrongUrl.run({chatUrl:'https://spicychat.ai/chat/00000000-0000-0000-0000-000000000000'})).status,'invalid-chat-url');
 assert.equal(wrongUrl.sends.length,0);
 console.log('PASS: native Dislike only, one mutating UI request, legacy 200-only records rechecked, unverified votes not saved');
})().catch(e=>{console.error(e);process.exitCode=1});
