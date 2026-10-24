#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const content=fs.readFileSync(path.join(root,'content/card-token-main.js'),'utf8');
const background=fs.readFileSync(path.join(root,'background/features/background-worker-less-like.js'),'utf8');

const ratingStart=content.indexOf('  async function postRecombeeLessLike(');
const ratingEnd=content.indexOf('\n  window.addEventListener(RECOMMENDATION_WORKER_PROBE_REQUEST_EVENT',ratingStart);
assert(ratingStart>0 && ratingEnd>ratingStart);
const ratingSource=content.slice(ratingStart,ratingEnd);
function ratingScenario({http=401,throwNetwork=false}={}){
  const hits=[];
  const context={
    collectPerformanceRecombeeSamples:()=>{},
    recombeeSignedRequestSamples:[],
    recombeeTokenCandidatesCache:['candidateB'],
    recombeeTokenCandidatesCachedAt:0,
    recombeeTokenCandidatesExhaustive:false,
    recombeePublicToken:'candidateA',recombeePublicTokenValidated:true,
    plausibleRecombeeToken:token=>String(token||'').trim(),
    discoverRecombeeTokenCandidates:async()=>['candidateC'],
    identifyRecombeeTokenFromSignedRequests:async()=>'',
    hmacSha1Hex:async()=> 'signed',
    nativeFetch:async(url,options)=>{
      hits.push({url,options});
      if(throwNetwork) throw Error('network interruption');
      return {status:http,ok:http>=200&&http<300,text:async()=> ''};
    },
    responseRetryAfterMs:()=>0,
    Date, Math, Set, Promise
  };
  vm.createContext(context);
  vm.runInContext(`${ratingSource}\nthis.post=postRecombeeLessLike;`,context);
  return {context,hits,post:(botId,user)=>context.post(botId,user)};
}

const jobStart=background.indexOf('async function runDirectCharacterFeedback(');
const jobEnd=background.indexOf('async function runQuickLessLikeBot(',jobStart);
assert(jobStart>0&&jobEnd>jobStart);
const workerSource=background.slice(background.indexOf('const quickLessLikePausedBulkRuns = new Map();'),background.indexOf('function quickLessLikeWorkerUrlInfo(')) + background.slice(jobStart,jobEnd);
function workerScenario(responses){
  const sends=[],reloads=[],ready=new Map([[14,Date.now()]]);
  const context={
    Date,Math,Set,Map,Promise,
    quickLessLikeClosedBulkRuns:new Map(),
    quickLessLikeReadyWorkerTabs:ready,
    quickLessLikeRecommendationWorkerUrl:()=>({href:'https://spicychat.ai/'}),
    QUICK_LESS_LIKE_READY_TTL_MS:10*60*1000,
    cachedReadyQuickLessLikeBulkWorker:()=>({ready:true,ok:true,tabId:14}),
    ensureQuickLessLikeRecommendationWorker:async()=>({ready:true,ok:true,tabId:14}),
    acquireBackgroundJob:async()=>({leaseId:'lease-1',waitMs:0}),
    releaseBackgroundJob:()=>{},
    tabsSendMessage:async(_tabId,message)=>{sends.push(message);return responses.shift();},
    tabsUpdate:async(_tabId,query)=>{reloads.push(query);return {ok:true}},
    tabsGet:async()=>({id:14}),
    recordHelperLifecycle:async()=>{},
    probeQuickLessLikeRecommendationWorker:async()=>({ready:true,ok:true}),
  };
  vm.createContext(context);
  vm.runInContext(`${workerSource}\nthis.run=runDirectCharacterFeedback;`,context);
  return {sends,reloads,context,run:()=>context.run({botId:'a3f2ddc0-9779-4b37-8b8a-fad4aff6460a',bulkRunId:'bulk-1'},'less-like')};
}
(async()=>{
  const rejected=ratingScenario({http:401});
  const a=await rejected.post('a3f2ddc0-9779-4b37-8b8a-fad4aff6460a','user-1');
  assert.equal(a.status,'recombee-auth-rejected');
  assert.equal(a.httpStatus,401);
  assert.equal(a.ratingConfirmed,false);
  assert.equal(a.authRejected,true);
  assert.equal(rejected.hits.length,1,'do not try another public token on 401');
  assert.equal(rejected.context.recombeePublicTokenValidated,false);
  const forbidden=ratingScenario({http:403});
  assert.equal((await forbidden.post('a3f2ddc0-9779-4b37-8b8a-fad4aff6460a','user-1')).status,'recombee-auth-rejected');
  assert.equal(forbidden.hits.length,1);
  const success=ratingScenario({http:200});
  assert.equal((await success.post('a3f2ddc0-9779-4b37-8b8a-fad4aff6460a','user-1')).status,'less-liked');
  assert.equal(success.hits.length,1);
  const net=ratingScenario({throwNetwork:true});
  assert.equal((await net.post('a3f2ddc0-9779-4b37-8b8a-fad4aff6460a','user-1')).networkAmbiguous,true);
  assert.equal(net.hits.length,1);

  const workers=workerScenario([{status:'recombee-auth-rejected',authRejected:true,httpStatus:401,requestSent:true}]);
  const first=await workers.run();
  assert.equal(first.bulkPaused,true);
  assert.equal(workers.sends.length,1);
  const second=await workers.run();
  assert.equal(second.status,'recommendation-feedback-paused');
  assert.equal(second.requestSent,false);
  assert.equal(workers.sends.length,1);
  assert.equal(workers.reloads.length,0);

  const badPreflight=workerScenario([{status:'character-auth-rejected',httpStatus:401,requestSent:false,networkAttempts:0}]);
  const blocked=await badPreflight.run();
  assert.equal(blocked.bulkPaused,true);
  assert.equal(badPreflight.reloads.length,0,'do not reload+retry a rejected character auth preflight');
  assert.equal((await badPreflight.run()).status,'recommendation-feedback-paused');
  assert.equal(badPreflight.sends.length,1);

  const noReply=workerScenario([null]);
  const unknown=await noReply.run();
  assert.equal(unknown.status,'direct-feedback-result-unknown');
  assert.equal(unknown.networkAmbiguous,true);
  assert.equal(unknown.retryable,false);
  assert.equal(noReply.sends.length,1,'never replay after a lost helper response');
  assert.equal(noReply.reloads.length,0,'no automatic worker reload/replay after lost response');
  assert.equal((await noReply.run()).status,'recommendation-feedback-paused');
  assert.equal(noReply.sends.length,1);
  console.log('PASS: 401/403 context rejection stops token probing, unknown responses are not replayed, bulk run pauses, 200 remains successful');
})().catch(error=>{console.error(error);process.exitCode=1});
