"use strict";
// Producer allowlist from Inspector sct-event-schema.json (sct.community.v1).
globalThis.DSQSctInspectorFactory=()=>{
const DSQ_SCT_EVENT_SCHEMA = {"type":"object","additionalProperties":false,"required":["phase","correlation"],"properties":{"phase":{"type":"string","enum":["start","attempt","submission","response","verification","failure","interruption","recovery","completion","observation"]},"action":{"type":"string","enum":["create","edit","delete","save","publish","unpublish","visibility","attach","detach","import","export","read","unknown"]},"creationType":{"type":"string","enum":["lorebook","lorebook-entry","chatbot","rulebook","group"]},"outcome":{"type":"string","enum":["http-success","http-error","rate-limited","network-error","validation-failed","pending","readback-match","readback-mismatch","native-ui-observed","journal-reported","manual-check","reported-success","reported-failure","unknown"]},"reason":{"type":"string","enum":["watchdog","form-changed","keyword-changed","validation","rate-limit","navigation","freeze","reload","background","cancelled","timeout","unavailable","unknown"]},"correlation":{"type":"object","properties":{"projectId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},"releaseId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},"publicationJobId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},"operationId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},"internalCreationId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},"nativeCreationId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},"internalEntryId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},"nativeEntryId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},"creationType":{"type":"string","enum":["lorebook","lorebook-entry","chatbot","rulebook","group"]}},"required":["operationId"],"additionalProperties":false},"counts":{"type":"object","properties":{"processed":{"type":"integer","minimum":0,"maximum":1000000},"total":{"type":"integer","minimum":0,"maximum":1000000},"created":{"type":"integer","minimum":0,"maximum":1000000},"skipped":{"type":"integer","minimum":0,"maximum":1000000},"remaining":{"type":"integer","minimum":0,"maximum":1000000},"expected":{"type":"integer","minimum":0,"maximum":1000000},"observed":{"type":"integer","minimum":0,"maximum":1000000},"retries":{"type":"integer","minimum":0,"maximum":1000000},"resumes":{"type":"integer","minimum":0,"maximum":1000000},"entries":{"type":"integer","minimum":0,"maximum":1000000}},"additionalProperties":false},"durationMs":{"type":"number","minimum":0,"maximum":86400000},"status":{"type":"integer","minimum":0,"maximum":599},"qolVersion":{"type":"string","pattern":"^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$"},"errorCode":{"type":"string","pattern":"^SC-\\d{3}-\\d{4}$"},"pendingWrite":{"type":"boolean"},"previousConfirmed":{"type":"boolean"},"nativeCreationId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},"nativeEntryId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},"nativeResponseId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},"relatedNativeId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},"visibility":{"type":"string","enum":["public","private","unlisted","draft"]},"publicationStatus":{"type":"string","enum":["draft","pending","approved","rejected","published","unpublished","under-review"]}}};
const P='sct.community.v1', KEY='dsSctInspectorDeliveryV1', MAX=256, BATCH=16, RETRIES=3, UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i, ID=/^[a-p]{32}$/;
const modes=['editor','publication','errors','full'];
const ids=['projectId','revisionId','releaseId','publicationJobId','operationId','internalCreationId','nativeCreationId','internalEntryId','nativeEntryId'];
let serial=Promise.resolve(), inbox=[], timer=null, cached=null, ctxAt=0, ctxDest='', scheduled=false, overflow=0;
const lock=fn=>{const p=serial.then(fn);serial=p.catch(()=>{});return p;};
const get=async key=>(await chrome.storage.local.get(key))[key];
const save=async (key,v)=>chrome.storage.local.set({[key]:v});
const stats=()=>({stored:0,duplicates:0,conflicts:0,dropped:0,invalid:0,inactive:0,unconfirmed:0});
const empty=(dest)=>({dest,recordingId:null,streamId:crypto.randomUUID(),next:0,queue:[],contextFailures:0,expiresAt:0,retryAfter:0,stats:stats(),status:'not-connected'});
const validId=v=>typeof v==='string'&&ID.test(v)&&v!==chrome.runtime.id;
const uuid=v=>typeof v==='string'&&UUID.test(v);
function project(value,schema){
 if(value===undefined)return undefined;
 if(schema.type==='array'){if(!Array.isArray(value)||value.length>schema.maxItems)throw Error('invalid');return value.map(v=>project(v,schema.items));}
 if(schema.type==='object'){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid');const out={};for(const [k,s] of Object.entries(schema.properties||{})){const x=project(value[k],s);if(x!==undefined)out[k]=x;}for(const k of schema.required||[])if(out[k]===undefined)throw Error('invalid');return out;}
 if(schema.type==='string'){if(typeof value!=='string'||(schema.pattern&&!new RegExp(schema.pattern).test(value))||(schema.enum&&!schema.enum.includes(value)))throw Error('invalid');return schema.pattern&&UUID.test(value)?value.toLowerCase():value;}
 if(schema.type==='boolean'){if(typeof value!=='boolean')throw Error('invalid');return value;}
 if(schema.type==='number'||schema.type==='integer'){if(typeof value!=='number'||!Number.isFinite(value)||(schema.type==='integer'&&!Number.isInteger(value))||value<schema.minimum||value>schema.maximum)throw Error('invalid');return value;}
 throw Error('invalid');
}
function sanitize(e){const v=project(e,DSQ_SCT_EVENT_SCHEMA);if(!v||!uuid(v.correlation?.operationId))throw Error('invalid');v.qolVersion=chrome.runtime.getManifest().version;if(!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v.qolVersion))throw Error('invalid');return v;}
// Optional producer contract: only explicit field-path advertisements opt in.
// Never infer capabilities from the peer version or accept a remote schema.
const optionalPaths=new Set(['schemaVersion','eventId','event.schemaVersion','event.eventId','event.correlation.revisionId','event.operationStage','event.evidenceClass','event.metrics','event.fieldChecks']);
const stageNames=['package-validation','native-association','field-comparison','entry-comparison','form-preparation','native-save','native-acknowledgement','native-readback','serialization','compression','parsing','transfer','storage','batch','duplicate-prevention','cancellation'];
const evidenceNames=['intent-reported','request-reported','response-reported','readback-reported','comparison-reported','journal-reported','measurement-reported','unknown'];
const fieldNames=['name','title','greeting','personality','scenario','example-dialogue','tags','visibility','avatar','description','entry-name','keywords','entry-content','entry-order','rulebook-rules','group-members','attachments'];
const fieldResults=['match','mismatch','missing','unknown'];
const metricNames=['packageBytes','compressedBytes','transferredBytes','serializationMs','compressionMs','parsingMs','transferMs','storageMs','batchSize','batchIndex','batches','transferredEntries','duplicateEntries','interruptedBatches','storageReads','storageWrites','longTasks','longTaskMs','repeatedTransfers'];
const enumSchema=values=>({type:'string',enum:values});
const optionalMetadata={operationStage:enumSchema(stageNames),evidenceClass:enumSchema(evidenceNames),metrics:{type:'object',properties:Object.fromEntries(metricNames.map(k=>[k,{type:k.endsWith('Ms')?'number':'integer',minimum:0,maximum:k.endsWith('Ms')?86400000:k.endsWith('Bytes')?1e12:1000000}]))},fieldChecks:{type:'array',maxItems:32,items:{type:'object',required:['field','result'],properties:{field:enumSchema(fieldNames),result:enumSchema(fieldResults)}}}};
const supportsAll=(offered,known)=>Array.isArray(offered)&&known.every(x=>offered.includes(x));
function metadata(raw){const out={};for(const [k,schema] of Object.entries(optionalMetadata)){if(raw?.[k]!==undefined){try{const v=project(raw[k],schema);if(k==='fieldChecks'&&new Set(v.map(x=>x.field)).size!==v.length)continue;out[k]=v;}catch{}}}return out;}
function optionalCapabilities(c){const caps=c?.capabilities, fields=caps?.optionalFields;const out=new Set(Array.isArray(fields)?fields.filter(x=>optionalPaths.has(x)&&!Object.hasOwn(optionalMetadata,x.replace(/^event\./,''))):[]); // Actual Inspector 0.1.16 advertises envelope flags, not field paths.
 if(caps?.schemaVersion===1){out.add('schemaVersion');if(caps.optionalEventId===true)out.add('eventId');if(caps.optionalRevisionId===true)out.add('event.correlation.revisionId');if(supportsAll(caps.operationStages,stageNames))out.add('event.operationStage');if(supportsAll(caps.evidenceClasses,evidenceNames))out.add('event.evidenceClass');if(supportsAll(caps.metricFields,metricNames))out.add('event.metrics');if(supportsAll(caps.comparisonFields,fieldNames)&&supportsAll(caps.comparisonResults,fieldResults))out.add('event.fieldChecks');}return out;}

// Reuse the existing producer UUID pattern rather than accepting arbitrary metadata.
const identifierSchema=DSQ_SCT_EVENT_SCHEMA.properties.correlation.properties.operationId;
const extendedEventSchema={...DSQ_SCT_EVENT_SCHEMA,properties:{...DSQ_SCT_EVENT_SCHEMA.properties,...optionalMetadata,schemaVersion:{type:'integer',minimum:1,maximum:1},eventId:identifierSchema,correlation:{...DSQ_SCT_EVENT_SCHEMA.properties.correlation,properties:{...DSQ_SCT_EVENT_SCHEMA.properties.correlation.properties,revisionId:identifierSchema}}}};
function decorate(message,cx,eventId,revisionId,meta={}){const caps=cx.capabilities||new Set();const event={...message.event,correlation:{...message.event.correlation}};const out={...message,event};if(caps.has('schemaVersion'))out.schemaVersion=1;if(caps.has('eventId'))out.eventId=eventId;if(caps.has('event.schemaVersion'))event.schemaVersion=1;if(caps.has('event.eventId'))event.eventId=eventId;if(caps.has('event.correlation.revisionId')&&uuid(revisionId))event.correlation.revisionId=revisionId.toLowerCase();for(const [k,v] of Object.entries(meta))if(caps.has('event.'+k))event[k]=v;return out;}
function requiredCapabilities(m){return [...optionalPaths].filter(path=>path.split('.').reduce((obj,key)=>obj?.[key],m)!==undefined);}
function wireOptionalValid(m){const keys=['protocol','type','recordingId','streamId','sequence','tabId','observedAt','event'];return keys.every(k=>Object.hasOwn(m,k))&&Object.keys(m).every(k=>keys.includes(k)||k==='schemaVersion'||k==='eventId')&&(!Object.hasOwn(m,'schemaVersion')||m.schemaVersion===1)&&(!Object.hasOwn(m,'eventId')||uuid(m.eventId))&&(!m.eventId||!m.event?.eventId||m.eventId===m.event.eventId);}
function context(c){
 if(!c||c.ok!==true||c.protocol!==P||!uuid(c.recordingId)||!modes.includes(c.mode)||!['selected-tab','all-editors'].includes(c.scope)||c.transfer!=='disabled'||!Number.isFinite(c.expiresAt)||c.expiresAt<=Date.now()||c.expiresAt>Date.now()+7*86400000+60000||!/^\d+\.\d+\.\d+$/.test(c.inspectorVersion||''))return null;
 const [maj,min,patch]=c.inspectorVersion.split('.').map(Number);if(maj===0&&(min<1||min===1&&patch<14))return null;
 if(c.scope==='selected-tab'&&(!Number.isInteger(c.tabId)||c.tabId<0||c.tabId>2147483647))return null;
 const correlation={};if(c.correlation!=null){if(typeof c.correlation!=='object'||Array.isArray(c.correlation))return null;for(const k of ids){if(c.correlation[k]!=null){if(!uuid(c.correlation[k]))return null;correlation[k]=c.correlation[k];}}if(c.correlation.creationType!=null){if(!DSQ_SCT_EVENT_SCHEMA.properties.creationType.enum.includes(c.correlation.creationType))return null;correlation.creationType=c.correlation.creationType;}}
 return {recordingId:c.recordingId,mode:c.mode,scope:c.scope,tabId:c.tabId,expiresAt:c.expiresAt,correlation,capabilities:optionalCapabilities(c)};
}
function send(dest,msg){return new Promise(resolve=>{let done=false;const finish=r=>{if(!done){done=true;clearTimeout(t);resolve(r);}};const t=setTimeout(()=>finish(null),4000);try{chrome.runtime.sendMessage(dest,msg,r=>{if(chrome.runtime.lastError)finish(null);else finish(r);});}catch{finish(null);}});}
async function getContext(dest,force=false){if(!force&&ctxDest===dest&&Date.now()-ctxAt<15000&&(!cached||cached.expiresAt>Date.now()))return cached;const result=await send(dest,{protocol:P,type:'SCT_GET_CONTEXT'});ctxDest=dest;ctxAt=Date.now();cached=context(result);return cached;}
function eligible(c,tabId,e){if(c.scope==='selected-tab'&&c.tabId!==tabId)return false;for(const k of ['projectId','revisionId','releaseId','publicationJobId','internalCreationId','nativeCreationId']){const v=c.correlation[k],local=e.correlation[k];if(v!=null&&local!=null&&String(local).toLowerCase()!==String(v).toLowerCase())return false;}return true;}
function ack(a){if(!a||typeof a!=='object')return 'unconfirmed';const counters=['stored','duplicates','conflicts','dropped','invalid'];if(counters.some(k=>a[k]!=null&&(!Number.isInteger(a[k])||a[k]<0||a[k]>1)))return 'unconfirmed';const positives=counters.filter(k=>a[k]===1);if(positives.length>1||(a.notActive===true||a.notActive===1)&&positives.length)return 'unconfirmed';if(a.notActive===true||a.notActive===1)return 'inactive';if(positives.length===1){if(['stored','duplicates'].includes(positives[0])&&a.ok!==true)return 'unconfirmed';return positives[0];}return 'unconfirmed';}
function strictShape(value,schema){if(schema.type==='array')return Array.isArray(value)&&value.length<=schema.maxItems&&value.every(v=>strictShape(v,schema.items));if(schema.type==='object'){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(schema.properties||{},k)))return false;for(const [k,v] of Object.entries(value))if(!strictShape(v,schema.properties[k]))return false;return (schema.required||[]).every(k=>Object.hasOwn(value,k));}try{project(value,schema);return value!==undefined;}catch{return false;}}
function wireValid(row,s,prior){const m=row?.message;return !!m&&wireOptionalValid(m)&&m.protocol===P&&m.type==='SCT_OPERATION_EVENT'&&m.recordingId===s.recordingId&&uuid(m.recordingId)&&m.streamId===s.streamId&&Number.isInteger(m.sequence)&&m.sequence>prior&&m.sequence<s.next&&m.sequence<=100000000&&Number.isInteger(m.tabId)&&m.tabId>=0&&m.tabId<=2147483647&&Number.isFinite(m.observedAt)&&m.observedAt>=0&&m.observedAt<=1000000000000000&&strictShape(m.event,extendedEventSchema)&&uuid(m.event.correlation?.operationId)&&typeof m.event.qolVersion==='string'&&typeof row.sourcePath==='string'&&row.sourcePath.length<=200&&dsqSctTabSender({id:chrome.runtime.id,url:'https://spicychat.ai'+row.sourcePath,frameId:0,tab:{id:m.tabId}})&&!/[?#]/.test(row.sourcePath)&&Number.isInteger(row.attempts)&&row.attempts>=0&&row.attempts<=RETRIES;}
async function state(dest){const s=await get(KEY);if(!s||s.dest!==dest||!uuid(s.streamId)||!Number.isInteger(s.next)||s.next<0||s.next>100000001||!Array.isArray(s.queue)||s.queue.length>MAX||!s.stats)return empty(dest);for(const k of Object.keys(stats()))if(!Number.isSafeInteger(s.stats[k])||s.stats[k]<0)s.stats[k]=0;let prior=-1,changed=false;const valid=[];for(const row of s.queue){if(!wireValid(row,s,prior)){s.stats.invalid++;changed=true;continue;}prior=row.message.sequence;const existingId=row.message.eventId||row.message.event.eventId;if(!uuid(row.eventId)||(existingId&&row.eventId!==existingId)){row.eventId=existingId||crypto.randomUUID();changed=true;}valid.push(row);}if(changed){s.queue=valid;await save(KEY,s);}return s;}
function summary(c,s){return {ok:true,enabled:!!c.enabled,inspectorId:c.inspectorId||'',qolId:chrome.runtime.id,status:s?.status||'disabled',queued:s?.queue?.length||0,...(s?.stats||stats())};}
function schedule(delay=30000){try{chrome.alarms.create(DSQ_SCT_ALARM,{when:Date.now()+Math.max(1000,delay)});}catch{}}
async function current(c){const now=await dsqSctConfig();return now.enabled===true&&now.inspectorId===c.inspectorId&&validId(c.inspectorId);}
function push(e,s,at){if(!Number.isFinite(at)||at<0||at>Date.now()+60000||at<Date.now()-7*86400000)return false;const event=sanitize(e);if(inbox.length>=MAX){overflow=Math.min(1000000,overflow+1);return false;}inbox.push({event,meta:metadata(e),eventId:crypto.randomUUID(),revisionId:uuid(e.correlation?.revisionId)?e.correlation.revisionId.toLowerCase():undefined,tabId:s.tab.id,observedAt:at,sourcePath:new URL(s.url).pathname,recordingHint:cached?.recordingId||null});return true;}
function routeIdentity(s,e){const pathname=new URL(s.url).pathname;const native=pathname.match(/\/edit\/([0-9a-f-]{36})(?:\/|$)/i)?.[1]||pathname.match(/\/chatbot\/([0-9a-f-]{36})\/edit(?:\/|$)/i)?.[1];const id=e.correlation?.nativeCreationId;if(native&&id&&native.toLowerCase()!==id.toLowerCase())return false;return true;}
async function tabStillEligible(row){try{const t=await chrome.tabs.get(row.message.tabId);const a=new URL(t.url);return !t.incognito&&a.origin==='https://spicychat.ai'&&a.pathname.replace(/\/$/,'')===row.sourcePath.replace(/\/$/,'');}catch{return false;}}
function requestFlush(c){if(timer||scheduled)return;timer=setTimeout(()=>{timer=null;wake(c);},750);}
async function enqueue(c){const s=await state(c.inspectorId);const batch=inbox.splice(0,MAX);if(overflow){s.stats.dropped+=overflow;overflow=0;await save(KEY,s);}if(!batch.length)return s;if(!await current(c))return s;
 const cx=await getContext(c.inspectorId);if(!cx){s.stats.inactive+=batch.length;s.status='no-authorized-active-context';await save(KEY,s);return s;}
 if(s.recordingId!==cx.recordingId){s.stats.inactive+=s.queue.length;s.queue=[];s.recordingId=cx.recordingId;s.streamId=crypto.randomUUID();s.next=0;s.contextFailures=0;s.retryAfter=0;}s.expiresAt=cx.expiresAt;
 for(const x of batch){if(x.recordingHint&&x.recordingHint!==cx.recordingId){s.stats.inactive++;continue;}if(!eligible(cx,x.tabId,{...x.event,correlation:{...x.event.correlation,revisionId:x.revisionId}})){s.stats.invalid++;continue;}if(s.queue.length>=MAX||s.next>100000000){s.stats.dropped++;continue;}const message=decorate({protocol:P,type:'SCT_OPERATION_EVENT',recordingId:cx.recordingId,streamId:s.streamId,sequence:s.next++,tabId:x.tabId,observedAt:x.observedAt,event:x.event},cx,x.eventId,x.revisionId,x.meta);s.queue.push({message,eventId:x.eventId,sourcePath:x.sourcePath,attempts:0});}
 s.status=s.queue.length?'queued':'no-eligible-events';await save(KEY,s);if(s.queue.length)schedule();return s;
}
async function drain(c,s){
 if(!s.queue.length||!await current(c)){if(!s.queue.length)try{await chrome.alarms.clear(DSQ_SCT_ALARM);}catch{}return s;}
 if(s.retryAfter>Date.now()){schedule(s.retryAfter-Date.now());return s;}
 if(s.expiresAt&&s.expiresAt<=Date.now()){s.stats.inactive+=s.queue.length;s.queue=[];s.status='recording-expired';await save(KEY,s);return s;}
 const cx=await getContext(c.inspectorId);if(!cx){s.contextFailures=(s.contextFailures||0)+1;s.retryAfter=Date.now()+30000;s.status='context-unavailable';if(s.contextFailures>=RETRIES){s.stats.unconfirmed+=s.queue.length;s.queue=[];s.status='context-retry-limit';}await save(KEY,s);if(s.queue.length)schedule();return s;}
 s.expiresAt=cx.expiresAt;s.retryAfter=0;
 if(cx.recordingId!==s.recordingId){s.stats.inactive+=s.queue.length;s.queue=[];s.status='recording-changed';await save(KEY,s);return s;}
 // A capability downgrade cannot rewrite a previously attempted message.
 // Keep its exact payload and use the existing bounded context retry budget.
 if(s.queue.length && requiredCapabilities(s.queue[0].message).some(k=>!cx.capabilities.has(k))){s.contextFailures=(s.contextFailures||0)+1;s.retryAfter=Date.now()+30000;s.status='optional-capability-unavailable';if(s.contextFailures>=RETRIES){s.queue.shift();s.stats.unconfirmed++;s.contextFailures=0;}await save(KEY,s);if(s.queue.length)schedule();return s;}
 s.contextFailures=0;
 // Reserve a bounded batch's attempt budget durably before dispatch; immutable wire evidence remains unchanged.
 // If interrupted before dispatch, a reserved attempt can be consumed, never a native operation.
 while(s.queue[0]?.attempts>=RETRIES){s.queue.shift();s.stats.unconfirmed++;}const firstUnsupported=s.queue.findIndex(row=>requiredCapabilities(row.message).some(k=>!cx.capabilities.has(k)));const reserved=s.queue.slice(0,firstUnsupported<0?BATCH:Math.min(BATCH,firstUnsupported));const allocated=new Set();for(const row of reserved)if(row.attempts<RETRIES){row.attempts++;allocated.add(row);}
 await save(KEY,s);schedule();let count=0;const checkedTabs=new Map();
 while(s.queue.length&&count<reserved.length&&await current(c)){
  const row=s.queue[0],m=row.message;count++;
  const tabKey=m.tabId+'|'+row.sourcePath;if(!checkedTabs.has(tabKey))checkedTabs.set(tabKey,await tabStillEligible(row));
  if(cx.expiresAt<=Date.now()||!eligible(cx,m.tabId,m.event)||!checkedTabs.get(tabKey)){s.stats.inactive++;s.queue.shift();s.status='context-or-tab-changed';continue;}
  if(!allocated.has(row)){s.stats.unconfirmed++;s.queue.shift();s.status='delivery-unconfirmed';continue;}
  const result=ack(await send(c.inspectorId,m));s.status=result;
  if(result==='unconfirmed'){if(row.attempts>=RETRIES){s.stats.unconfirmed++;s.queue.shift();}cached=null;ctxAt=0;s.retryAfter=Date.now()+30000;break;}
  s.stats[result]++;s.queue.shift();if(result==='inactive'){s.stats.inactive+=s.queue.length;s.queue=[];cached=null;ctxAt=0;break;}
  if(result==='conflicts'){s.stats.dropped+=s.queue.length;s.queue=[];s.streamId=crypto.randomUUID();s.next=0;cached=null;ctxAt=0;break;}
  if(result==='dropped'){s.stats.dropped+=s.queue.length;s.queue=[];break;}
 }
 for(const row of reserved.slice(count))if(allocated.has(row)&&s.queue.includes(row))row.attempts=Math.max(0,row.attempts-1);
 if(!s.queue.length)s.retryAfter=0;await save(KEY,s);if(s.queue.length){schedule(s.retryAfter>Date.now()?s.retryAfter-Date.now():30000);if(!s.retryAfter)setTimeout(()=>wake(c),750);}else try{await chrome.alarms.clear(DSQ_SCT_ALARM);}catch{}return s;
}
function wake(c){if(scheduled)return;scheduled=true;void lock(async()=>{if(!await current(c)){return;}const s=await enqueue(c);await drain(c,s);}).catch(()=>{if(c.enabled&&inbox.length)requestFlush(c);}).finally(()=>{scheduled=false;if(inbox.length)void dsqSctConfig().then(now=>{if(now.enabled)requestFlush(now);else{inbox=[];overflow=0;}});});}
function journal(j,s,c,at){try{const correlation={operationId:j.jobId,nativeCreationId:j.bookId};const counts={processed:j.processed,total:j.total,retries:j.retries,resumes:j.resumes};const base={creationType:'lorebook',action:'import',correlation,counts,pendingWrite:j.pendingWrite,previousConfirmed:j.previousConfirmed};let e;
 switch(j.action){case 'start':e={...base,phase:'start',outcome:'pending'};break;case 'resume':e={...base,phase:'recovery',outcome:'journal-reported'};break;case 'begin':e={...base,creationType:'lorebook-entry',action:j.kind==='update'?'edit':'create',correlation:{...correlation,operationId:j.attemptId},phase:'start',outcome:'pending'};break;case 'receipt':e={...base,creationType:'lorebook-entry',action:'save',correlation:{...correlation,operationId:j.attemptId,...(uuid(j.entryId)?{nativeEntryId:j.entryId}:{})},phase:'response',status:j.status,outcome:j.status===429?'rate-limited':j.status>=200&&j.status<300?'http-success':j.status===0?'network-error':'http-error'};break;case 'commit':if(j.result==='skipped'){if(j.processed%25!==0&&j.processed!==j.total)return;e={...base,phase:'observation',outcome:'journal-reported'};}else e={...base,creationType:'lorebook-entry',action:'save',correlation:{...correlation,operationId:j.attemptId,nativeEntryId:j.entryId},phase:j.reconciled?'verification':'completion',outcome:j.reconciled?'readback-match':'journal-reported'};break;case 'rejected':case 'not-sent':e={...base,correlation:{...correlation,operationId:j.attemptId},creationType:'lorebook-entry',action:'save',phase:'failure',outcome:'reported-failure',...(j.action==='rejected'?{status:j.status}:{reason:'form-changed'})};break;case 'finish':e={...base,phase:'completion',outcome:'journal-reported',counts:{...counts,entries:j.verifiedCount}};break;case 'stop':case 'cancel-saved':case 'get':e={...base,phase:'interruption',reason:j.action==='cancel-saved'?'cancelled':j.reason,outcome:'journal-reported'};break;default:return;}
 if(push(e,s,at))requestFlush(c);
 }catch{}}
async function accept(m,s,c){if(!validId(c.inspectorId))return {ok:false,status:'invalid-destination'};if(m.type==='DS_SCT_INSPECTOR_TEST')return lock(async()=>{const cx=await getContext(c.inspectorId,true);if(!cx)return {ok:false,status:'no-authorized-active-context'};const e=sanitize({phase:'observation',action:'unknown',outcome:'manual-check',correlation:{operationId:crypto.randomUUID()}});if(!eligible(cx,s.tab.id,e))return {ok:false,status:'ineligible-tab'};const st=await state(c.inspectorId);if(st.queue.length||inbox.length)return {ok:false,status:'pending-deliveries'};if(st.recordingId!==cx.recordingId){st.recordingId=cx.recordingId;st.streamId=crypto.randomUUID();st.next=0;}st.expiresAt=cx.expiresAt;st.contextFailures=0;st.retryAfter=0;if(st.next>100000000)return {ok:false,status:'stream-capacity'};const eventId=crypto.randomUUID();const message=decorate({protocol:P,type:'SCT_OPERATION_EVENT',recordingId:cx.recordingId,streamId:st.streamId,sequence:st.next++,observedAt:Date.now(),tabId:s.tab.id,event:e},cx,eventId);st.queue.push({message,eventId,sourcePath:new URL(s.url).pathname,attempts:0});await save(KEY,st);schedule();const before={...st.stats};await drain(c,st);if(st.status==='stored'||st.status==='duplicates'){const duplicate=ack(await send(c.inspectorId,message));if(duplicate==='duplicates'){st.stats.duplicates++;st.status='test-committed-and-duplicate';}else {st.status='test-committed; duplicate-'+duplicate;st.stats[duplicate]=(st.stats[duplicate]||0)+1;}await save(KEY,st);}return {ok:st.stats.stored>before.stored||st.stats.duplicates>before.duplicates,status:st.status,...Object.fromEntries(Object.keys(before).map(k=>[k,st.stats[k]-before[k]]))};});
 try{if(!routeIdentity(s,m.event)||!push(m.event,s,m.observedAt))return {ok:false,status:'invalid-or-buffer-full'};requestFlush(c);return {ok:true,status:'buffered-not-committed'};}catch{return {ok:false,status:'invalid-event'};}}
async function settings(m,c){return lock(async()=>{c=await dsqSctConfig();if(m.type==='DS_SCT_INSPECTOR_CONFIG'){const id=typeof m.inspectorId==='string'?m.inspectorId.trim():'';if((m.enabled===true&&!validId(id))||(id&&!validId(id)))return {ok:false,status:'invalid-destination'};const next={enabled:m.enabled===true,inspectorId:id};if(c.enabled!==next.enabled||c.inspectorId!==id){inbox=[];overflow=0;cached=null;ctxAt=0;if(timer){clearTimeout(timer);timer=null;}await chrome.alarms.clear(DSQ_SCT_ALARM);await save(KEY,empty(id));}await save(DSQ_SCT_CONFIG,next);dsqSctConfigPromise=Promise.resolve(dsqSctConfigValue=next);const saved=await state(id);if(!next.enabled)saved.status='disabled';else if(saved.status==='not-connected')saved.status='configured; test from an editor';return summary(next,saved);}return summary(c,await state(c.inspectorId));});}
return Object.freeze({settings,accept,journal,wake});
};

// Alpha.7/8 managed connection. Separate from Inspector transport; synthetic read-only tests only.
// A dedicated extension-origin database keeps bearer credentials out of chrome.storage,
// ordinary backups, synchronization, content scripts and diagnostic payloads.
globalThis.DSQSctManagedFactory=()=>{
 const ORIGIN='https://spicychat-creatortools.drache.uk', HOST=ORIGIN+'/*', DB='dsq-sct-managed-private-v1', ALARM='ds-sct-managed-heartbeat-v1';
 const TOKEN=/^sct_install_[A-Za-z0-9_-]{43}$/, UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i, VERSION=/^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/;
 const caps=['operation-context','browser-health','extension-health'];
 const capabilities=r=>r?.workerEnabled===true?[...caps,'synthetic-worker']:[...caps];
 const workerPaths=['worker-claim','worker-batch','worker-progress','worker-complete'];
 const controlValid=c=>c&&typeof c.maintenance==='boolean'&&typeof c.emergency_stop==='boolean';
 const negotiated=r=>Array.isArray(r?.backendCapabilities);
 const supportsWorker=r=>controlValid(r?.control)&&(!negotiated(r)||r.backendCapabilities.includes('synthetic-worker'));
 const interval=(r,worker=false)=>1000*(worker?Math.min(r?.pollIntervalSeconds||60,r?.heartbeatIntervalSeconds||300):(r?.heartbeatIntervalSeconds||300));
 const nextCheck=r=>Date.now()+interval(r,r?.workerEnabled===true);
 const rotationAllowed=r=>controlValid(r?.control)&&(!negotiated(r)||r.backendCapabilities.includes('managed-rotation'));
 const safeList=(v,allowed,max=32)=>Array.isArray(v)&&v.length<=max?[...new Set(v.filter(x=>allowed.includes(x)))]:null;
 const serverCaps=['batch-receipts','request-status','extended-diagnostics','manual-transfer-grants','managed-rotation','managed-controls','managed-recordings','synthetic-worker'];
 const limitKeys=['maxBatchEvents','maxBatchBytes','maxRecordingEvents','maxRetainedEvents','maxActiveRequests','maxReceiptsPerInstallation','maxRetentionDays','manualGrantSeconds'];
 const limitBounds=[200,524288,5000,50000,10,10000,30,3600];
 function negotiate(result){
  const present=['authorizedProjectIds','backendVersion','protocolVersions','diagnosticSchemaVersions','serverCapabilities','diagnosticMetadata','limits','heartbeatIntervalSeconds','pollIntervalSeconds','sharingModes','revoked','credentialStatus'].some(k=>k in result);
  if(!present)return {managed:null,authorizedProjectIds:result.projectId?[result.projectId]:[],backendCapabilities:null,protocolVersions:null,diagnosticSchemaVersions:null,diagnosticMetadata:null,limits:null,heartbeatIntervalSeconds:null,pollIntervalSeconds:null,sharingModes:null,credentialStatus:null};
  if(result.revoked===true||['revoked','expired'].includes(result.credentialStatus))throw fault('authorization-rejected');
  if(result.managed!==true||result.revoked!==false||result.credentialStatus!=='active'||!ver(result.backendVersion)||!Array.isArray(result.authorizedProjectIds)||result.authorizedProjectIds.length>100||!result.authorizedProjectIds.every(uuid)|| (result.projectId!==null&&!result.authorizedProjectIds.includes(result.projectId))||!Array.isArray(result.protocolVersions)||!result.protocolVersions.includes('sct.integration.v1')||!Array.isArray(result.diagnosticSchemaVersions)||!result.diagnosticSchemaVersions.includes(1))throw fault('incompatible');
  const backendCapabilities=safeList(result.serverCapabilities,serverCaps),sharingModes=safeList(result.sharingModes,['automatic','report-request','manual-transfer','operation-recording']);
  if(!backendCapabilities||!sharingModes||!result.limits||!result.diagnosticMetadata||typeof result.diagnosticMetadata!=='object'||Array.isArray(result.diagnosticMetadata)||!int(result.heartbeatIntervalSeconds,1,86400)||!int(result.pollIntervalSeconds,1,86400))throw fault('incompatible');
  const limits={};for(let i=0;i<limitKeys.length;i++){const k=limitKeys[i];if(!int(result.limits[k],1,1000000000))throw fault('incompatible');limits[k]=Math.min(result.limits[k],limitBounds[i]);}
  // Keep the intersection of the server's advertised metadata and known safe values.
  // Local peer negotiation stays separate; Inspector owns the upload projection.
  const m=result.diagnosticMetadata,diagnosticMetadata={};
  for(const k of ['eventId','revisionId','httpStatus'])if(m[k]===true)diagnosticMetadata[k]=true;
  const vocab={observerSource:['page','qol','inspector','operator','unknown'],evidenceClass:['measurement-reported','page-observed','qol-reported','operator-reported','inspector-receipt','native-response-observed','native-readback-observed','unknown','intent-reported','request-reported','response-reported','readback-reported','comparison-reported','journal-reported'],operationStage:['package-validation','native-association','field-comparison','entry-comparison','form-preparation','native-save','native-acknowledgement','native-readback','serialization','compression','parsing','transfer','storage','batch','duplicate-prevention','cancellation'],errorClass:['network','timeout','rate-limit','http','validation','permission','cancelled','interrupted','storage','unavailable','unknown'],metrics:['processedEntries','totalEntries','remainingEntries','transferredEntries','batchIndex','batchSize','batchCount','batches','packageBytes','compressedBytes','transferredBytes','serializationMs','compressionMs','parsingMs','transferMs','storageMs','storageReads','storageWrites','reads','writes','duplicates','duplicateEntries','interruptedBatches','retries','resumes','longTasks','longTaskMs','repeatedTransfers']};
  for(const [k,allowed] of Object.entries(vocab)){const list=safeList(m[k],allowed,64);if(list)diagnosticMetadata[k]=list;}
  const fc=m.fieldChecks;
  if(fc?.shape==='array-of-field-result'){const fields=safeList(fc.fields,['name','title','greeting','personality','scenario','exampleDialogue','exampleDialogues','description','tags','visibility','personalityVisibility','allowInGroups','avatar','cover','lorebook','rulebook','voice','members','firstSpeaker','entries','entryName','keywords','secondaryKeywords','content','priority','enabled','constant','selective','caseSensitive','probability','depth','role','meters','combinedRules','statusLine','entry-order','rulebook-rules','attachments'],64),results=safeList(fc.results,['match','mismatch','missing','unavailable','unsupported','unverified','not-checked','unknown']);if(fields&&results)diagnosticMetadata.fieldChecks={fields,results,shape:'array-of-field-result'};}

  return {managed:true,authorizedProjectIds:[...new Set(result.authorizedProjectIds)],backendCapabilities,protocolVersions:['sct.integration.v1'],diagnosticSchemaVersions:[1],diagnosticMetadata,limits,heartbeatIntervalSeconds:Math.max(60,result.heartbeatIntervalSeconds),pollIntervalSeconds:Math.max(60,result.pollIntervalSeconds),sharingModes,credentialStatus:'active'};
 }
 const expiry=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
 // Local aggregate observations only, scoped to server-issued synthetic identities.
 // Do not send to the legacy tab-scoped Inspector peer until a managed peer contract exists.
 const counters=['batches','transferredEntries','valueBytes','transferMs','processingMs','recoveries'];
 const observation=(r,j,delta={})=>{const old=r.workerObservation,match=old?.syntheticJobId===j.jobId&&old?.operationId===j.operationId;
  const o={syntheticJobId:j.jobId,operationId:j.operationId,updatedAt:Date.now()};for(const k of counters)o[k]=Math.min(Number.MAX_SAFE_INTEGER,(match&&Number.isFinite(old[k])?Math.max(0,old[k]):0)+(delta[k]||0));return o;};
 const observationView=r=>{const o=r?.workerObservation;if(!uuid(o?.syntheticJobId)||!uuid(o?.operationId))return null;return {syntheticJobId:o.syntheticJobId,operationId:o.operationId,updatedAt:Number.isFinite(o.updatedAt)?o.updatedAt:null,...Object.fromEntries(counters.map(k=>[k,Number.isFinite(o[k])?o[k]:0]))};};
 const workerState=r=>({enabled:r?.workerEnabled===true,status:r?.workerStatus||'disabled',jobId:uuid(r?.workerJob?.jobId)?r.workerJob.jobId:null,processed:Number.isInteger(r?.workerJob?.processed)?r.workerJob.processed:null,total:Number.isInteger(r?.workerJob?.total)?r.workerJob.total:null,operationId:uuid(r?.workerJob?.operationId)?r.workerJob.operationId:null,leaseExpiresAt:expiry(r?.workerJob?.leaseUntil),attempts:Number.isInteger(r?.workerJob?.attempts)?r.workerJob.attempts:null});
 const uuid=v=>typeof v==='string'&&UUID.test(v), ver=v=>typeof v==='string'&&VERSION.test(v)?v:null;
 const ownVersion=()=>chrome.runtime.getManifest().version;
 let lane=Promise.resolve(), dbKnown=false; const serial=fn=>{const p=lane.then(fn);lane=p.catch(()=>{});return p;};
 async function dbCall(write,value,key='connection'){
  if(!write&&!dbKnown&&typeof indexedDB.databases==='function'&&!(await indexedDB.databases()).some(x=>x.name===DB))return null;
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('private');r.onsuccess=()=>resolve(r.result);r.onerror=r.onblocked=()=>reject(Error('storage'));});
  dbKnown=true;
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction('private',write?'readwrite':'readonly'), store=tx.objectStore('private');const r=write?(value===null?store.delete(key):store.put(value,key)):store.get(key);tx.oncomplete=()=>resolve(write?null:r.result||null);tx.onabort=tx.onerror=()=>reject(Error('storage'));});}finally{db.close();}
 }
 const read=()=>dbCall(false),save=r=>dbCall(true,r);
 // Managed synthetic evidence is a separate background-only path. No native tab,
 // publication identity, credentials, entry values or backend upload authority.
 const PEER_KEY='managed-peer-evidence-v1', PEER_PROTOCOL='sct.community.v1';
 const peerId=v=>typeof v==='string'&&/^[a-p]{32}$/.test(v)&&v!==chrome.runtime.id;
 const peerSend=(dest,message)=>new Promise(resolve=>{let finished=false;const done=x=>{if(!finished){finished=true;clearTimeout(timer);resolve(x);}};const timer=setTimeout(()=>done(null),1500);try{chrome.runtime.sendMessage(dest,message,r=>done(chrome.runtime.lastError?null:r));}catch{done(null);}});
 const peerCurrent=async dest=>{const c=await dsqSctConfig();return c.enabled===true&&c.inspectorId===dest&&peerId(dest);};
 const sameCorrelation=(c,j)=>!!c&&Object.keys(c).length===2&&c.syntheticJobId===j.jobId&&c.operationId===j.operationId;
 function managedContext(c,j){
  if(!c||c.ok!==true||c.protocol!==PEER_PROTOCOL||c.transfer!=='disabled'||c.managedRecording!==true||c.synthetic!==true||c.capabilities?.managedRecordingContext!==true||c.capabilities?.schemaVersion!==1||c.capabilities?.optionalEventId!==true||!uuid(c.recordingContextId)||!uuid(c.recordingId)||!uuid(c.streamId)||!sameCorrelation(c.correlation,j)||!int(c.nextSequenceHint,0,100000001)||!int(c.maxEvents,1,5000)||!Number.isFinite(c.expiresAt)||c.expiresAt<=Date.now()||c.expiresAt>Date.now()+3660000)return null;
  return c;
 }
 const peerContext=async(dest,j)=>managedContext(await peerSend(dest,{protocol:PEER_PROTOCOL,type:'SCT_GET_CONTEXT',managedRecordingContext:true,operationId:j.operationId}),j);
 const peerMatch=(s,c)=>s.contextId===c.recordingContextId&&s.recordingId===c.recordingId&&s.streamId===c.streamId&&s.jobId===c.correlation.syntheticJobId&&s.operationId===c.correlation.operationId;
 // Recheck optional capabilities on retries, without editing queued evidence.
 function peerWireAllowed(m,s,c){
  if(!m||m.protocol!==PEER_PROTOCOL||m.type!=='SCT_OPERATION_EVENT'||m.schemaVersion!==1||m.recordingContextId!==s.contextId||m.recordingId!==s.recordingId||m.streamId!==s.streamId||!uuid(m.eventId)||!int(m.sequence,0,100000000)||m.sequence>=s.next||!Number.isFinite(m.observedAt)||m.observedAt<0||m.observedAt>Date.now()+60000||!sameCorrelation(m.event?.correlation,{jobId:s.jobId,operationId:s.operationId})||Object.keys(m).some(k=>!['protocol','type','schemaVersion','recordingContextId','recordingId','streamId','eventId','sequence','observedAt','event'].includes(k)))return false;
  const e=m.event,cap=c.capabilities;
  if(e.action!=='read'||!['start','observation','recovery','interruption','completion','failure'].includes(e.phase)||!['pending','journal-reported','reported-success','reported-failure'].includes(e.outcome)||!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(e.qolVersion||'')||Object.keys(e).some(k=>!['phase','action','outcome','correlation','counts','qolVersion','reason','durationMs','operationStage','evidenceClass','metrics'].includes(k)))return false;
  if(!e.counts||Object.keys(e.counts).some(k=>!['processed','total','remaining'].includes(k))||!int(e.counts.total,1,5000)||!int(e.counts.processed,0,e.counts.total)||e.counts.remaining!==e.counts.total-e.counts.processed)return false;
  if(e.reason!==undefined&&!['background','unavailable'].includes(e.reason))return false;
  if(e.durationMs!==undefined&&(!Number.isFinite(e.durationMs)||e.durationMs<0||e.durationMs>86400000))return false;
  if(e.operationStage!==undefined&&(!['batch','transfer','package-validation'].includes(e.operationStage)||!Array.isArray(cap.operationStages)||!cap.operationStages.includes(e.operationStage)))return false;
  if(e.evidenceClass!==undefined&&(e.evidenceClass!=='measurement-reported'||!Array.isArray(cap.evidenceClasses)||!cap.evidenceClasses.includes(e.evidenceClass)))return false;
  if(e.metrics!==undefined&&(!e.metrics||typeof e.metrics!=='object'||Array.isArray(e.metrics)||Object.entries(e.metrics).some(([k,v])=>!['processedEntries','totalEntries','remainingEntries','batches','transferredEntries','transferredBytes','transferMs','resumes'].includes(k)||!Array.isArray(cap.metricFields)||!cap.metricFields.includes(k)||!Number.isFinite(v)||v<0||v>(k.endsWith('Ms')?86400000:k.endsWith('Bytes')?1073741824:1000000)||(!k.endsWith('Ms')&&!Number.isInteger(v)))))return false;
  return true;
 }
 const peerAck=a=>{if(!a||typeof a!=='object')return 'unconfirmed';const keys=['stored','duplicates','conflicts','dropped','invalid'];if(keys.some(k=>a[k]!=null&&!int(a[k],0,1)))return 'unconfirmed';const yes=keys.filter(k=>a[k]===1);if((a.notActive===true||a.notActive===1)&&!yes.length)return 'inactive';if(yes.length!==1||a.notActive===true||a.notActive===1)return 'unconfirmed';return ['stored','duplicates'].includes(yes[0])&&a.ok!==true?'unconfirmed':yes[0];};
 const peerEmpty=()=>({streams:[],stored:0,duplicates:0,unresolved:0,status:'not-connected'});
 async function peerRead(){const s=await dbCall(false,null,PEER_KEY);return s&&Array.isArray(s.streams)?s:peerEmpty();}
 const peerSave=s=>dbCall(true,s,PEER_KEY);
 const peerView=s=>({status:s.status,queued:s.streams.reduce((n,x)=>n+x.rows.length,0),stored:s.stored,duplicates:s.duplicates,unresolved:s.unresolved});
 function peerEvent(r,j,c,phase,before){
  const o=r.workerObservation||{},caps=c.capabilities||{},processed=int(j.processed,0,j.total)?j.processed:0;
  const e={phase,action:'read',outcome:phase==='completion'?'reported-success':phase==='start'?'pending':phase==='failure'?'reported-failure':'journal-reported',correlation:{syntheticJobId:j.jobId,operationId:j.operationId},counts:{processed,total:j.total,remaining:j.total-processed},qolVersion:ownVersion()};
  if(phase==='interruption')e.reason='background';if(phase==='failure')e.reason='unavailable';
  const duration=(o.processingMs||0)-(before.workerObservation?.syntheticJobId===j.jobId?(before.workerObservation.processingMs||0):0);if(Number.isFinite(duration)&&duration>=0&&duration<=86400000)e.durationMs=duration;
  const stage=phase==='completion'?'package-validation':phase==='start'?'batch':phase==='interruption'?'transfer':'batch';if(caps.operationStages?.includes(stage))e.operationStage=stage;
  if(caps.evidenceClasses?.includes('measurement-reported'))e.evidenceClass='measurement-reported';
  const metrics={processedEntries:processed,totalEntries:j.total,remainingEntries:j.total-processed,batches:o.batches,transferredEntries:o.transferredEntries,transferredBytes:o.valueBytes,transferMs:o.transferMs,resumes:o.recoveries};
  const safe={};for(const [k,v] of Object.entries(metrics))if(Array.isArray(caps.metricFields)&&caps.metricFields.includes(k)&&Number.isFinite(v)&&v>=0&&v<=(k.endsWith('Ms')?86400000:k.endsWith('Bytes')?1073741824:1000000)&&(k.endsWith('Ms')||Number.isInteger(v)))safe[k]=v;
  if(Object.keys(safe).length)e.metrics=safe;
  return e;
 }
 async function syntheticPeer(before,after){
  const config=await dsqSctConfig();if(!config.enabled||!peerId(config.inspectorId))return {status:'disabled'};
  const dest=config.inspectorId,s=await peerRead(),j=after.workerJob,installationId=after.installationId;if(!uuid(installationId))return {status:'installation-unconfirmed'};
  let c=null,stream=null,dirty=false;
  if(j&&uuid(j.jobId)&&uuid(j.operationId)&&int(j.total,1,5000)&&int(j.processed,0,j.total)){
   const previous=before.workerJob,obs=after.workerObservation||{},changed=previous?.jobId!==j.jobId||previous?.leaseId!==j.leaseId||previous?.processed!==j.processed||before.workerStatus!==after.workerStatus||before.workerObservation?.batches!==obs.batches;
   // One context discovery per changed worker snapshot. No polling on ordinary installations.
   if(changed){
    dirty=true;c=await peerContext(dest,j);
    if(c&&await peerCurrent(dest)){
     stream=s.streams.find(x=>x.dest===dest&&x.installationId===installationId&&peerMatch(x,c));
     const existingOwner=s.streams.find(x=>x.contextId===c.recordingContextId||x.recordingId===c.recordingId||x.streamId===c.streamId);
     if(!stream&&!existingOwner&&s.streams.length<32){stream={dest,installationId,contextId:c.recordingContextId,recordingId:c.recordingId,streamId:c.streamId,jobId:j.jobId,operationId:j.operationId,expiresAt:c.expiresAt,next:c.nextSequenceHint,allocated:0,rows:[],last:null};s.streams.push(stream);}
     if(stream){
      const fingerprint=JSON.stringify([j.jobId,j.leaseId||null,j.processed,after.workerStatus,obs.batches||0,obs.recoveries||0]);
      if(stream.last!==fingerprint){
       const phases=[];if(previous?.jobId!==j.jobId)phases.push('start');else if(j.leaseId&&previous?.leaseId!==j.leaseId)phases.push('recovery');
       if(after.workerStatus==='completed')phases.push('completion');else if(/paused|reconciliation/.test(after.workerStatus))phases.push('interruption');else if(/stopped|unconfirmed|rejected/.test(after.workerStatus))phases.push('failure');else if(j.processed!==previous?.processed||obs.batches!==before.workerObservation?.batches)phases.push('observation');
       if(!phases.length)phases.push('observation');
       stream.next=Math.max(stream.next,c.nextSequenceHint);stream.last=fingerprint;
       for(const phase of phases){if(s.streams.reduce((n,x)=>n+x.rows.length,0)>=256||stream.allocated>=c.maxEvents||stream.next>=100000001){s.unresolved++;s.status='local-evidence-capacity';continue;}
        const message={protocol:PEER_PROTOCOL,type:'SCT_OPERATION_EVENT',schemaVersion:1,recordingContextId:stream.contextId,recordingId:stream.recordingId,streamId:stream.streamId,eventId:crypto.randomUUID(),sequence:stream.next++,observedAt:Date.now(),event:peerEvent(after,j,c,phase,before)};
        stream.allocated++;stream.rows.push({message,status:'pending'});s.status='queued';
       }
       // Allocate sequence and persist immutable wire message together, before any send.
       await peerSave(s);
      }
     }else{s.unresolved++;s.status=existingOwner?'context-owner-changed':'local-context-capacity';}
    }else{s.status='managed-context-unavailable';}
   }
  }
  // Retry only the original recording; never redirect to ordinary or another managed context.
  const canDrain=x=>x.dest===dest&&x.installationId===installationId&&x.rows.some(y=>y.status==='pending')&&(!x.retryAfter||x.retryAfter<=Date.now());
  const pending=stream&&canDrain(stream)?stream:s.streams.find(canDrain);
  if(pending){
   dirty=true;if(pending.expiresAt<=Date.now()){for(const row of pending.rows)if(row.status==='pending')row.status='expired';s.status='recording-expired';}
   else{
    const cx=stream===pending&&c?c:await peerContext(dest,{jobId:pending.jobId,operationId:pending.operationId});
    if(cx&&peerMatch(pending,cx)){pending.retryAfter=0;
     for(const row of pending.rows.filter(y=>y.status==='pending').slice(0,2)){
      if(!await peerCurrent(dest)||cx.expiresAt<=Date.now())break;
      if(!peerWireAllowed(row.message,pending,cx)){s.status='pending-evidence-not-negotiated';pending.retryAfter=Date.now()+300000;break;}
      const result=peerAck(await peerSend(dest,row.message));s.status=result;
      if(result==='stored'||result==='duplicates'){s[result]++;pending.rows.splice(pending.rows.indexOf(row),1);await peerSave(s);}
      else if(result==='unconfirmed'){break;}else{row.status=result;await peerSave(s);if(['inactive','dropped','conflicts'].includes(result)){for(const other of pending.rows)if(other.status==='pending')other.status='held-'+result;break;}}
     }
    }else{s.status='original-context-unavailable';pending.retryAfter=Date.now()+300000;}
   }
  }
  // Keep unresolved wire evidence, and prune only expired, fully acknowledged stream counters.
  const retained=s.streams.filter(x=>x.rows.length||x.expiresAt>Date.now());if(retained.length!==s.streams.length){s.streams=retained;dirty=true;}if(dirty)await peerSave(s);return peerView(s);
 }

 const chunkKey=offset=>'synthetic:'+String(offset/200).padStart(2,'0');
 const readChunk=offset=>dbCall(false,null,chunkKey(offset));
 const saveChunk=(j,offset,values)=>dbCall(true,{jobId:j.jobId,operationId:j.operationId,total:j.total,values},chunkKey(offset));
 const clearChunks=()=>dbCall(true,null,IDBKeyRange.bound('synthetic:00','synthetic:24'));
 async function eraseConnection(){const db=await new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>req.result.createObjectStore('private');req.onsuccess=()=>resolve(req.result);req.onerror=req.onblocked=()=>reject(Error('storage'));});try{await new Promise((resolve,reject)=>{const tx=db.transaction('private','readwrite'),store=tx.objectStore('private');store.delete('connection');store.delete(IDBKeyRange.bound('synthetic:00','synthetic:24'));tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(Error('storage'));});}finally{db.close();}}
 const permission=()=>chrome.permissions.contains({origins:[HOST]});
 const clear=()=>chrome.alarms.clear(ALARM);
 async function arm(r){if((r?.auto||r?.pendingToken)&&TOKEN.test(r.token||'')&&!['authorization-rejected','scope-forbidden','incompatible','permission-required'].includes(r.status)){// Creating an alarm with the same name replaces it atomically; never clear first.
  await chrome.alarms.create(ALARM,{when:Math.max(Date.now()+60000,r.nextAt||Date.now()+300000)});
 }else await clear();}
 function projection(r){return {ok:true,status:r?.status||'not-configured',configured:!!r?.token,auto:!!r?.auto,installationId:uuid(r?.installationId)?r.installationId:null,projectId:uuid(r?.projectId)?r.projectId:null,backendVersion:ver(r?.backendVersion),lastSuccess:Number.isFinite(r?.lastSuccess)?r.lastSuccess:null,lastChecked:Number.isFinite(r?.lastChecked)?r.lastChecked:null,authorization:r?.expiresAt&&r.expiresAt<=Date.now()?'expired':r?.status==='authorized'&&r.lastSuccess&&Date.now()-r.lastSuccess<600000?'last-check-authorized':r?.status==='authorization-rejected'?'rejected':'unconfirmed',expiresAt:r?.expiresAt||null,expiryWarning:r?.expiresAt?(r.expiresAt<=Date.now()?'expired':r.expiresAt-Date.now()<=7*86400000?'expires-within-7-days':r.expiresAt-Date.now()<=30*86400000?'renewal-window':null):null,rotationDue:r?.rotationDue===true,rotationPending:!!r?.pendingToken,control:controlValid(r?.control)?{...r.control}:null,clientCapabilities:capabilities(r),supportedEndpoints:['heartbeat','context',...(controlValid(r?.control)?['rotate',...workerPaths]:[])],backendCapabilities:r?.backendCapabilities||null,managed:r?.managed??null,authorizedProjectIds:r?.authorizedProjectIds||[],protocolVersions:r?.protocolVersions||null,diagnosticSchemaVersions:r?.diagnosticSchemaVersions||null,diagnosticMetadata:r?.diagnosticMetadata||null,limits:r?.limits||null,heartbeatIntervalSeconds:r?.heartbeatIntervalSeconds||null,pollIntervalSeconds:r?.pollIntervalSeconds||null,sharingModes:r?.sharingModes||null,credentialStatus:r?.status==='authorization-rejected'?'rejected':r?.credentialStatus||null,worker:workerState(r),workerObservation:observationView(r),managedPeer:r?.managedPeer||null,executionAuthorized:false,nativeSession:'unknown',inspectorHealth:'unknown',health:{browser:'running',qol:'running'},retryNotBefore:r?.retryNotBefore>Date.now()?r.retryNotBefore:null,nextHeartbeat:(r?.auto||r?.pendingToken)&&r?.token?r.nextAt||null:null};}
 const fault=(status,retryAt)=>Object.assign(Error(status),{status,retryAt});
 async function request(path,token,body){
  // Fixed, non-redirecting HTTPS endpoint allowlist. Never send credentials to healthz.
  if(!['heartbeat','context','healthz','rotate',...workerPaths].includes(path))throw fault('incompatible');
  if(!await permission())throw fault('permission-required');
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),8000);
  try{
   const health=path==='healthz';if(!health&&!TOKEN.test(token||''))throw fault('authorization-rejected');
   const response=await fetch(ORIGIN+(health?'/healthz':'/api/integration/v1/'+path),{method:health?'GET':'POST',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,headers:health?{'Accept':'application/json'}:{'Accept':'application/json','Content-Type':'application/json','Authorization':'Bearer '+token},...(health?{}:{body:JSON.stringify({protocol:'sct.integration.v1',...body})})});
   if(!response.ok){const ra=response.headers.get('Retry-After');const n=ra===null?NaN:Number(ra), t=Number.isFinite(n)?Date.now()+Math.max(0,n)*1000:Date.parse(ra);let status=response.status===401?'authorization-rejected':response.status===403?'scope-forbidden':response.status===404?'not-found':response.status===409?'conflict':response.status===429||response.status===503?'backoff':'backend-unavailable';
    if(response.status===409||response.status===404){try{const body=await readResponse(response);if(response.status===409&&['managed-emergency-stop','worker-lease-inactive'].includes(body.error))status=body.error;else if(response.status===404&&body.error==='worker-lease-not-found')status=body.error;}catch{}}
    throw fault(status,Number.isFinite(t)?Math.min(Date.now()+3600000,t):undefined);}
   return await readResponse(response);
  }catch(e){throw fault(['authorization-rejected','scope-forbidden','not-found','conflict','managed-emergency-stop','worker-lease-inactive','worker-lease-not-found','backoff','backend-unavailable','incompatible','permission-required'].includes(e?.status)?e.status:'network-unavailable',e?.retryAt);}finally{clearTimeout(timer);}
 }
 async function readResponse(response){
   const reader=response.body?.getReader();if(!reader)throw fault('incompatible');let size=0,parts=[];try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw fault('incompatible');}parts.push(value);}}finally{reader.releaseLock();}const data=new Uint8Array(size);let at=0;for(const p of parts){data.set(p,at);at+=p.byteLength;}let result;try{result=JSON.parse(new TextDecoder().decode(data));}catch{throw fault('incompatible');}if(!result||typeof result!=='object'||Array.isArray(result))throw fault('incompatible');return result;
 }
 async function heartbeat(r,manual){
  const now=Date.now();const result=await request('heartbeat',r.token,{version:ownVersion(),capabilities:capabilities(r),health:{browser:'running',qol:'running',qolVersion:ownVersion(),session:'unknown',inspector:'unknown'}});
  if(result.revoked===true||['revoked','expired'].includes(result.credentialStatus))throw fault('authorization-rejected');
  if(result.kind!=='qol'||(result.managed!==undefined&&result.managed!==true)||!uuid(result.installationId)||!(result.projectId===null||uuid(result.projectId))||result.executionAuthorized!==false||typeof result.automaticSharing!=='boolean'||!Number.isInteger(result.retentionDays)||result.retentionDays<1||result.retentionDays>30||r.installationId&&r.installationId!==result.installationId)throw fault('incompatible');
  // Alpha.7 has no expiry/control. Alpha.8 must return well-formed controls before worker or renewal.
  if(result.control!==undefined&&result.control!==null&&!controlValid(result.control))throw fault('incompatible');
  if(result.expiresAt!==undefined&&!expiry(result.expiresAt))throw fault('incompatible');
  if(result.rotationDue!==undefined&&typeof result.rotationDue!=='boolean')throw fault('incompatible');
  const negotiation=negotiate(result);if(negotiation.managed===true&&(!controlValid(result.control)||!expiry(result.expiresAt)||typeof result.rotationDue!=='boolean'))throw fault('incompatible');const updated={...r,...negotiation,status:'authorized',installationId:result.installationId,projectId:result.projectId,expiresAt:expiry(result.expiresAt),rotationDue:result.rotationDue===true,control:controlValid(result.control)?{maintenance:result.control.maintenance,emergency_stop:result.control.emergency_stop}:null,lastChecked:now,lastSuccess:Date.now(),nextAt:Date.now()+interval(negotiation,r.workerEnabled===true),retryNotBefore:0,failures:0};
  // Public version probe is independent of authorization; no bearer on this request.
  if(negotiation.managed===true){updated.backendVersion=ver(result.backendVersion);updated.healthAt=now;}else if(manual||!r.healthAt||now-r.healthAt>=3600000){try{const h=await request('healthz',null);updated.backendVersion=h.ok===true&&h.service==='creator-tools'?ver(h.version):null;updated.healthAt=Date.now();}catch{updated.backendVersion=null;updated.healthAt=Date.now();}}
  return updated;
 }
 function failed(r,e){const status=e?.status||'backend-unavailable';const failures=Math.min(6,(r.failures||0)+1);const base=r.workerEnabled&&['network-unavailable','backend-unavailable','backoff'].includes(status)?60000:300000;const nextAt=Math.max(Date.now()+Math.min(3600000,base*2**(failures-1)),e?.retryAt||0);return {...r,...(r.workerEnabled?{workerStatus:'waiting-'+status}:{}),status,lastChecked:Date.now(),failures,nextAt,retryNotBefore:status==='backoff'?nextAt:0,...(status==='authorization-rejected'?{token:null,pendingToken:null,auto:false,workerEnabled:false,workerStatus:'authorization-rejected',workerJob:null,workerObservation:null}:{}),...(['scope-forbidden','incompatible','permission-required'].includes(status)?{auto:false,workerEnabled:false,workerStatus:'stopped-'+status}:{})};}
 // The pending token is committed before the rotation request. An interrupted request
 // never destroys the old token until the pending credential proves authorization.
 function makeToken(){const bytes=crypto.getRandomValues(new Uint8Array(32));return 'sct_install_'+btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
 async function renew(r){
  if(!rotationAllowed(r)||!r.rotationDue||!r.expiresAt)return r;
  const pending=TOKEN.test(r.pendingToken||'')?r.pendingToken:makeToken();
  r={...r,pendingToken:pending};await arm({...r,nextAt:Date.now()+60000});await save(r);
  try{const ack=await request('rotate',r.token,{nextCredential:pending});if(ack.installationId!==r.installationId||ack.executionAuthorized!==false||!expiry(ack.expiresAt))throw fault('incompatible');}
  catch(e){ // Even a malformed or lost response might follow a committed rotation.
   if(e.status==='conflict'||e.status==='authorization-rejected'){try{return await provePending(r);}catch(p){if(p.status==='authorization-rejected'){if(e.status==='authorization-rejected')throw e;const old=await heartbeat(r,false);if(!old.rotationDue){const clean={...old,pendingToken:null};await save(clean);return clean;}}throw fault('backoff',Date.now()+300000);}}
   throw e.status==='incompatible'?fault('backoff',Date.now()+300000):e;
  }
  // The acknowledgement itself is not proof that the pending secret is usable.
  try{return await provePending(r);}catch(e){throw e.status==='authorization-rejected'?fault('backoff',Date.now()+300000):e;}
 }
 async function provePending(r){const next=await heartbeat({...r,token:r.pendingToken},false);const clean={...next,pendingToken:null};await save(clean);return clean;}
 async function authenticatedHeartbeat(r,manual){
  if(TOKEN.test(r.pendingToken||'')){try{return await provePending(r);}catch(e){if(e.status!=='authorization-rejected')throw e;}}
  let next=await heartbeat(r,manual);if(!next.rotationDue&&next.pendingToken)next={...next,pendingToken:null};await save(next);
  return renew(next);
 }
 const int=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
 function validJob(j){return j&&uuid(j.jobId)&&uuid(j.operationId)&&uuid(j.leaseId)&&j.mode==='synthetic-read-only'&&j.executionAuthorized===false&&j.state==='leased'&&int(j.total,1,5000)&&int(j.processed,0,j.total)&&int(j.progressSequence,0,100000)&&int(j.attempts,1,5)&&Number.isFinite(Date.parse(j.leaseUntil))&&Date.parse(j.leaseUntil)>Date.now();}
 function verifySummary(x,j,state,processed){if(!x||x.executionAuthorized!==false||x.mode!=='synthetic-read-only'||x.jobId!==j.jobId||x.operationId!==j.operationId||x.state!==state||x.total!==j.total||x.processed!==processed)throw fault('incompatible');}
 function validChunk(chunk,j,offset){const count=Math.min(200,j.total-offset);return chunk?.jobId===j.jobId&&chunk.operationId===j.operationId&&chunk.total===j.total&&Array.isArray(chunk.values)&&chunk.values.length===count&&chunk.values.every((v,i)=>v==='sct-synthetic-entry-'+(offset+i));}
 async function complete(r,j){
  // Only hash values actually retrieved and durably stored, in index order.
  let resultHash=j.resultHash;
  if(!/^[a-f0-9]{64}$/.test(resultHash||'')){
   const parts=[];for(let offset=0;offset<j.total;offset+=200){const chunk=await readChunk(offset);if(!validChunk(chunk,j,offset))throw fault('incompatible');parts.push(chunk.values.join('\n')+'\n');}
   resultHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(parts.join('')))),x=>x.toString(16).padStart(2,'0')).join('');
  }
  r={...r,workerJob:{...j,completionPending:true,resultHash},workerStatus:'completion-pending',nextAt:Date.now()+60000};await save(r);await arm(r);
  if(r.expiresAt<=Date.now())throw fault('authorization-rejected');
  const result=await request('worker-complete',r.token,{jobId:j.jobId,leaseId:j.leaseId,resultHash});verifySummary(result,j,'completed',j.total);
  const done={...r,workerJob:{jobId:j.jobId,operationId:j.operationId,processed:j.total,total:j.total,attempts:j.attempts},workerStatus:'completed',nextAt:nextCheck(r)};await save(done);await clearChunks();return done;
 }
 async function runWorker(r){
  if(!r.workerEnabled||!r.auto)return r;
  if(!supportsWorker(r))return {...r,workerStatus:'backend-worker-unavailable',nextAt:Date.now()+interval(r)};
  if(r.control.emergency_stop||(!negotiated(r)&&r.control.maintenance))return {...r,workerStatus:negotiated(r)?'paused-emergency-stop':'paused-by-server',nextAt:nextCheck(r)};
  if(!r.expiresAt||r.expiresAt<=Date.now())throw fault('authorization-rejected');
  r={...r,nextAt:Date.now()+60000};await save(r);await arm(r);
  try{
   if(r.workerJob?.completionPending&&uuid(r.workerJob.leaseId)){
    // Exact completion retry is safe after controls clear. A stale lease may have
    // been reassigned; reconcile through claim rather than inventing completion.
    try{return await complete(r,r.workerJob);}catch(e){if(!negotiated(r)||!['worker-lease-inactive','worker-lease-not-found'].includes(e.status))throw e;}
   }
   const claim=await request('worker-claim',r.token,{});
   if(claim.job===null&&claim.executionAuthorized===false){
    if(claim.stopped===true)return {...r,workerStatus:claim.reason==='managed-emergency-stop'?'paused-emergency-stop':claim.reason==='managed-maintenance'?'paused-maintenance':'paused-by-server',nextAt:nextCheck(r)};
    return {...r,workerJob:r.workerJob?.completionPending||r.workerStatus==='completed'?r.workerJob:null,workerStatus:r.workerJob?.completionPending?'completion-unconfirmed':r.workerStatus==='completed'?'completed':'idle',nextAt:nextCheck(r)};
   }
   let j=claim.job;if(!validJob(j))throw fault('incompatible');
   if(r.workerJob?.completionPending&&r.workerJob.jobId!==j.jobId)return {...r,workerEnabled:false,workerStatus:'completion-unconfirmed',nextAt:Date.now()+interval(r)};
   j={jobId:j.jobId,operationId:j.operationId,leaseId:j.leaseId,total:j.total,processed:j.processed,progressSequence:j.progressSequence,leaseUntil:j.leaseUntil,attempts:j.attempts};
   if(r.workerJob?.jobId!==j.jobId)await clearChunks();
   r={...r,workerJob:j,workerStatus:'leased',workerObservation:observation(r,j,{recoveries:r.workerJob?.jobId===j.jobId&&r.workerJob?.leaseId!==j.leaseId?1:0})};await save(r);
   const began=Date.now();let work=0,all=true;
   for(let offset=0;offset<j.total;offset+=200){
    const limit=Math.min(200,j.total-offset),end=offset+limit;let chunk=await readChunk(offset);const missing=!validChunk(chunk,j,offset);
    if(!missing&&end<=j.processed)continue;
    if(work>=4||Date.now()-began>=12000){all=false;break;}
    if(r.expiresAt<=Date.now())throw fault('authorization-rejected');
    if(Date.parse(j.leaseUntil)<=Date.now())throw fault('conflict');
    const batchBegan=Date.now();if(missing){const transferBegan=Date.now();const batch=await request('worker-batch',r.token,{jobId:j.jobId,leaseId:j.leaseId,offset,limit});
     if(batch.executionAuthorized!==false||batch.jobId!==j.jobId||batch.operationId!==j.operationId||!Array.isArray(batch.entries)||batch.entries.length!==limit||batch.nextOffset!==(end<j.total?end:null)||batch.entries.some((e,i)=>!e||e.index!==offset+i||e.value!=='sct-synthetic-entry-'+(offset+i)))throw fault('incompatible');
     const values=batch.entries.map(e=>e.value);await saveChunk(j,offset,values);r={...r,workerObservation:observation(r,j,{batches:1,transferredEntries:values.length,valueBytes:new TextEncoder().encode(values.join('\n')+'\n').byteLength,transferMs:Math.max(0,Date.now()-transferBegan)})};
    }
    // Progress also renews the lease while reconstructing an already acknowledged prefix.
    if(r.expiresAt<=Date.now())throw fault('authorization-rejected');
    if(Date.parse(j.leaseUntil)<=Date.now())throw fault('conflict');
    const target=Math.max(j.processed,end),sequence=j.progressSequence+1;
    const progress=await request('worker-progress',r.token,{jobId:j.jobId,leaseId:j.leaseId,sequence,processed:target});verifySummary(progress,j,'leased',target);
    if(!Number.isFinite(Date.parse(progress.leaseUntil))||Date.parse(progress.leaseUntil)<=Date.now())throw fault('incompatible');
    j={...j,processed:target,progressSequence:sequence,leaseUntil:progress.leaseUntil};r={...r,workerJob:j,workerStatus:'processing',workerObservation:observation(r,j,{processingMs:Math.max(0,Date.now()-batchBegan)})};await save(r);work++;
   }
   if(all&&j.processed===j.total)return await complete(r,j);
   return {...r,nextAt:Date.now()+60000};
  }catch(e){
   const saved=await read()||r;
   if(e.status==='managed-emergency-stop')return {...saved,workerStatus:'paused-emergency-stop',control:{maintenance:saved.control?.maintenance===true,emergency_stop:true},nextAt:nextCheck(saved)};
   if(negotiated(r)&&['worker-lease-inactive','worker-lease-not-found'].includes(e.status))return {...saved,workerStatus:'waiting-lease-reconciliation',nextAt:nextCheck(saved)};
   if(['conflict','not-found','worker-lease-inactive','worker-lease-not-found','scope-forbidden','incompatible'].includes(e.status))return {...saved,workerEnabled:false,workerStatus:'stopped-'+e.status,workerJob:saved.workerJob?{jobId:saved.workerJob.jobId,operationId:saved.workerJob.operationId,total:saved.workerJob.total,processed:saved.workerJob.processed}:null,nextAt:Date.now()+300000};
   throw e;
  }
 }
 async function validate(r,manual){
  if(!r?.token)return projection(r);if(r.retryNotBefore>Date.now()){await arm(r);return projection(r);}if(!manual&&((!r.auto&&!r.pendingToken)||r.nextAt>Date.now())){await arm(r);return projection(r);}
  // A crash before the next state commit must still leave a recovery alarm.
  await arm({...r,nextAt:Date.now()+60000});let next;
  try{next=await authenticatedHeartbeat(r,manual);if(next.workerEnabled&&next.auto)next=await runWorker(next);}catch(e){next=failed(await read()||r,e);}
  await save(next);if(next.status==='authorization-rejected')await clearChunks();await arm(next);
  // Observation failure must never alter a job, lease, credential or native action.
  if(next.status==='authorized'&&(next.workerEnabled||r.workerEnabled)&&next.auto){try{const managedPeer=await syntheticPeer(r,next);next={...next,managedPeer};await save(next);}catch{next={...next,managedPeer:{status:'local-evidence-unavailable'}};await save(next);}}
  return projection(next);
 }
 async function context(r,id){if(!uuid(id)||!r?.token||r.pendingToken||r.expiresAt&&r.expiresAt<=Date.now()||r.retryNotBefore>Date.now()||r.status!=='authorized'||!uuid(r.projectId))return {...projection(r),ok:false,operationStatus:'authorized-project-required'};try{const c=await request('context',r.token,{operationId:id.toLowerCase()});if(c.executionAuthorized!==false||c.operation_id!==id.toLowerCase()||c.project_id!==r.projectId||!uuid(c.job_id)||!uuid(c.release_id)||!['chatbot','lorebook','rulebook','group'].includes(c.creationType))throw fault('incompatible');const next={...r,lastSuccess:Date.now(),lastChecked:Date.now()};await save(next);return {...projection(next),operation:{operationId:c.operation_id,projectId:c.project_id,releaseId:c.release_id,publicationJobId:c.job_id,creationType:c.creationType,projectVersion:Number.isSafeInteger(c.projectVersion)?c.projectVersion:null,state:typeof c.state==='string'&&/^[a-z][a-z0-9_-]{0,39}$/.test(c.state)?c.state:null,executionAuthorized:false}};}catch(e){if(['authorization-rejected','permission-required','backoff'].includes(e.status)){const next=failed(r,e);await save(next);if(next.status==='authorization-rejected')await clearChunks();await arm(next);return {...projection(next),ok:false,operationStatus:e.status};}return {...projection(r),ok:false,operationStatus:e.status||'unavailable'};}}
 async function settings(m){return serial(async()=>{const r=await read();switch(m.type){
  case 'DS_SCT_MANAGED_STATUS':return projection(r);
  case 'DS_SCT_MANAGED_CONNECT':{if(m.confirmed!==true||!TOKEN.test(m.credential||''))return {...projection(r),ok:false,attemptStatus:'invalid-credential-or-consent'};if(!await permission())return {...projection(r),ok:false,attemptStatus:'permission-required'};let next;try{next=await heartbeat({token:m.credential,auto:m.auto===true},true);}catch(e){return {...projection(r),ok:false,attemptStatus:e.status||'unavailable'};}await clearChunks();await save(next);await arm(next);if(next.rotationDue&&rotationAllowed(next)){try{next=await renew(next);}catch(e){next=failed(await read()||next,e);}await save(next);await arm(next);}return projection(next);}
  case 'DS_SCT_MANAGED_VALIDATE':return validate(r,true);
  case 'DS_SCT_MANAGED_AUTO':{if(!r?.token)return {...projection(r),ok:false,attemptStatus:'not-configured'};if(m.enabled===true&&r.status!=='authorized')return {...projection(r),ok:false,attemptStatus:'validate-first'};const next={...r,auto:m.enabled===true,...(m.enabled!==true?{workerEnabled:false,workerStatus:'disabled'}:{}),nextAt:Date.now()+interval(r)};await save(next);await arm(next);return projection(next);}
  case 'DS_SCT_MANAGED_WORKER':{if(!r?.token)return {...projection(r),ok:false,attemptStatus:'not-configured'};if(m.enabled===true&&(m.confirmed!==true||!r.auto||r.status!=='authorized'||r.pendingToken||!r.expiresAt||r.expiresAt<=Date.now()||!supportsWorker(r)))return {...projection(r),ok:false,attemptStatus:'validate-managed-worker-and-enable-heartbeat-first'};const next={...r,workerEnabled:m.enabled===true,workerStatus:m.enabled===true?'waiting':'disabled',nextAt:Date.now()+interval(r,m.enabled===true)};await save(next);await arm(next);return projection(next);}
  case 'DS_SCT_MANAGED_CONTEXT':return context(r,m.operationId);
  case 'DS_SCT_MANAGED_DISCONNECT':if(r)await eraseConnection();await clear();return projection(null);
  default:return {ok:false,status:'unsupported'};
 }});}
 function wake(){return serial(async()=>{const r=await read();if(r?.auto||r?.pendingToken)return validate(r,false);await clear();});}
 return Object.freeze({settings,wake});
};
