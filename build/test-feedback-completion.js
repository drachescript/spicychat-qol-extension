const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..');
const A='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const noop=()=>{};
const statuses=[];
function setup(){
 const store={DH:{bots:{}},LH:{bots:{}},DB:{pendingIds:[],failedIds:[]},LB:{pendingIds:[],failedIds:[]}};
 const blockedState={ids:[A],meta:{[A]:{name:'A'},[B]:{name:'B'}}};
 const elements={};const c={console,Date,Math,Promise,setTimeout,clearTimeout,performance:{now:()=>Date.now()},navigator:{onLine:true,userAgent:'Chrome'},window:{},
 blockedState,blockedBulkDislikeRunning:false,blockedBulkDislikeStopRequested:false,activeBlockedBulkDislikeRunId:'',blockedBulkLessLikeRunning:false,blockedBulkLessLikeStopRequested:false,activeBlockedBulkLessLikeRunId:'',
 quickDislikeHistoryState:store.DH,quickDislikeBulkState:store.DB,quickLessLikeHistoryState:store.LH,quickLessLikeBulkState:store.LB,
 QUICK_DISLIKE_HISTORY_KEY:'DH',QUICK_DISLIKE_BULK_STATE_KEY:'DB',QUICK_LESS_LIKE_HISTORY_KEY:'LH',QUICK_LESS_LIKE_BULK_STATE_KEY:'LB',BOT_AVAILABILITY_KEY:'BA',botAvailabilityState:{meta:{}},
 BULK_DISLIKE_RETRY_LIMIT:0,BULK_DISLIKE_RETRY_BASE_MS:1,BULK_DISLIKE_FAILURE_PAUSE_THRESHOLD:3,BULK_DISLIKE_TRANSIENT_STATUSES:new Set(),
 BULK_LESS_LIKE_PACING:{minIntervalMs:0,maxIntervalMs:1000,checkpointEveryItems:2,checkpointEveryMs:10000,availabilityCheckpointEvery:10},
 BOT_ID_RE:/^[a-f0-9-]{36}$/,
 $:id=>elements[id]||= {textContent:'',disabled:false,hidden:false},
 value:()=>0,uniqueClean:xs=>[...new Set(xs.filter(Boolean))],validBotId:id=>/^[a-f0-9-]{36}$/.test(id),
 botManagerBulkSet:()=>new Set(),showSettingsToast:t=>statuses.push(t),renderBotManager:noop,updateBlockedDislikeStatus:noop,updateBlockedLessLikeStatus:noop,updateBlockedLessLikeActionState:noop,renderQuickLessLikeJobStats:noop, 
 normalizeBotAvailability:x=>x,normalizeQuickDislikeHistory:x=>x,normalizeQuickLessLikeHistory:x=>x,normalizeQuickDislikeBulkState:x=>x,normalizeQuickLessLikeBulkState:x=>x,
 storageGet:async ks=>Object.fromEntries(ks.map(k=>[k,store[k]])),storageSet:async x=>{Object.assign(store,x)},
 persistQuickDislikeBulkState:async x=>{store.DB={...x};c.quickDislikeBulkState=store.DB},
 persistQuickLessLikeBulkState:async x=>{store.LB={...x};c.quickLessLikeBulkState=store.LB},
 quickDislikeHistoryEntry:id=>store.DH.bots[id],quickLessLikeHistoryEntry:id=>store.LH.bots[id],blockedQuickLessLikeCounts:()=>({total:blockedState.ids.length,handled:Object.keys(store.LH.bots).length,remaining:blockedState.ids.filter(id=>!store.LH.bots[id]).length}),
 blockedQuickDislikeCounts:()=>({remaining:blockedState.ids.filter(id=>!store.DH.bots[id]).length}),
 ensureBlockingDataLoaded:async()=>{},ensureSavedListsDataLoaded:async()=>{},
 quickLessLikeFailureMeta:()=>({}),createQuickLessLikePacing:()=>({intervalMs:0}),snapshotQuickLessLikePacing:()=>({}),waitQuickLessLikeDelay:async()=>true,
 runtimeMessage:async p=> p.type==='DS_QUICK_LESS_LIKE_PREPARE_BULK'?{ready:true,tabId:0}:{}}
 vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'settings/features/options-bulk-feedback.js'),'utf8'),c);
 return {c,store,blockedState};
}
async function tests(){
 // While the run is processing A, B enters the blocked list. No silent 'complete'.
 let {c,store,blockedState}=setup();
 c.runtimeMessage=async p=>{
  if(p.type==='DS_QUICK_DISLIKE_BOT'){
   blockedState.ids.push(B);store.DH.bots[A]={status:'disliked',nativeEventConfirmed:true};
   return {ok:true,status:'disliked',nativeEventConfirmed:true,requestSent:true}
  }return {};
 };
 await c.runBlockedBulkDislike('remaining');
 assert.equal(store.DB.status,'paused');assert.deepEqual([...store.DB.pendingIds],[B]);
 assert.match(statuses.pop(),/1 still eligible/);
 console.log('PASS: Dislike preserves new and unhandled IDs');
 // Keep Less Like distinct, even when the run finishes its original snapshot.
 ({c,store,blockedState}=setup());
 c.runtimeMessage=async p=>{if(p.type==='DS_QUICK_LESS_LIKE_PREPARE_BULK')return {ready:true,tabId:0};if(p.type==='DS_QUICK_LESS_LIKE_BOT'){blockedState.ids.push(B);store.LH.bots[A]={status:'less-liked'};return {ok:true,status:'less-liked',httpStatus:200,requestSent:true}}return {};};
 c.runQuickLessLikeWithBackoff=async()=>{blockedState.ids.push(B);return {ok:true,status:'less-liked'}};
 c.applyQuickLessLikeResponseToLocalHistory=id=>{store.LH.bots[id]={status:'less-liked'};return 'less-liked'};
 await c.runBlockedBulkLessLike('remaining');
 assert.equal(store.LB.status,'paused');assert.deepEqual([...store.LB.pendingIds],[B]);
 assert.match(statuses.pop(),/1 still eligible/);
 console.log('PASS: Less Like preserves new and unhandled IDs');
 // The API's HTTP success is not enough if its payload says 'deleted'.
 const src=fs.readFileSync(path.join(root,'content/card-token-main.js'),'utf8');
 const start=src.indexOf('  async function checkCharacterAccessible('),end=src.indexOf('  async function recommendationWorkerReadiness',start);
 assert(start>=0&&end>start);
 let payload={id:A,deleted:true},code=200;
 const x={Date,console,AbortController,setTimeout,clearTimeout,waitForCharacterAuth:async()=>true,isJwt:()=>false,isGuest:()=>false,MAX_TOKEN:4000,capturedToken:'',capturedGuest:'',API_BASE:'https://prod.nd-api.com/v2/characters/',TIMEOUT_MS:1000,responseRetryAfterMs:()=>0,clean:String,nativeFetch:async()=>({status:code,ok:code>=200&&code<300,json:async()=>payload})};
 vm.createContext(x);vm.runInContext(src.slice(start,end),x);
 assert.equal((await x.checkCharacterAccessible(A)).status,'bot-not-found');
 payload={id:A,visibility:'unlisted',is_public:false,deleted:false};assert.equal((await x.checkCharacterAccessible(A)).status,'available');
 payload={id:A,status:'removed'};assert.equal((await x.checkCharacterAccessible(A)).status,'bot-not-found');
 payload={error:{code:'not_found'}};assert.equal((await x.checkCharacterAccessible(A)).status,'bot-not-found');
 code=404;assert.equal((await x.checkCharacterAccessible(A)).status,'bot-not-found');
 console.log('PASS: explicit tombstones skipped, unlisted bots remain available');
}
tests().catch(e=>{console.error(e);process.exitCode=1});
