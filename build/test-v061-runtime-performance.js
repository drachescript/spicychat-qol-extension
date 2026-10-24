"use strict";
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root,'content/runtime-improvements.js'),'utf8');
const main = fs.readFileSync(path.join(root,'content/main.js'),'utf8');
const core = fs.readFileSync(path.join(root,'content/core.js'),'utf8');
const composer = fs.readFileSync(path.join(root,'content/composer-control.js'),'utf8');

const observers = [];
const intervals = [];
class FakePerformanceObserver {
  constructor(fn) { this.fn=fn; observers.push(this); }
  observe(args) { this.args=args; }
  static supportedEntryTypes=['longtask','event'];
}
const ds = {
  state: { settings: { enabled:true, chatPerformanceMode:true, runtimePerformanceMode:'adaptive', performanceDiagnostics:false }, runtimePerformance:{} },
  isSingleChatPage:()=>true,
  getRuntimeEnvironment:()=>({android:true}),
  getLoadedChatMessageCount:()=>15,
  runtimeLog:()=>{},
  diagPerformance:()=>{},
  getPageState:()=>({}),
  collectCards:()=>[],
  __botMetadataRecoveryCaptureLoaded:true
};
const doc = {hidden:false,visibilityState:'visible',hasFocus:()=>true,
  getElementsByTagName(){this.domReads++;return {length:1500};},domReads:0,
  documentElement:{dataset:{},removeAttribute:()=>{},setAttribute:()=>{},hasAttribute:()=>false},
  querySelector:()=>null,querySelectorAll:()=>[], addEventListener:()=>{}
};
const context = {
  document:doc, chrome:{storage:{onChanged:{addListener:()=>{}}}},
  location:{pathname:'/chat/11111111-1111-1111-1111-111111111111',search:''},
  navigator:{userAgent:'Android'},
  sessionStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  performance:{now:()=>100000,memory:{usedJSHeapSize:50*1048576}},
  PerformanceObserver:FakePerformanceObserver, Date, Set, Map, Array, String, Number, Object, Math, URLSearchParams,
  console:{info:()=>{}},setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length},
  setTimeout:()=>1,clearTimeout:()=>{},
  addEventListener:()=>{},innerWidth:390
};
context.window=context;
context.DragonScriptQoL=ds;
vm.runInNewContext(source,context,{filename:'runtime-improvements.js'});
assert.strictEqual(observers.length,1,'exactly one long-task observer for pressure and diagnostics');
assert.ok(observers[0].args.type==='longtask');
assert.strictEqual(typeof ds.subscribeRuntimeLongTasks,'function');
let forwarded=0;
ds.subscribeRuntimeLongTasks(entries=>forwarded+=entries.length);
const emit=()=>observers[0].fn({getEntries:()=>[{duration:110,startTime:2345}]});
emit();
assert.strictEqual(forwarded,0,'no diagnostic processing when diagnostics disabled');
ds.state.settings.performanceDiagnostics=true;
emit();
assert.strictEqual(forwarded,1,'same measurement forwarded when diagnostics enabled');
const pressureTick=intervals.find(x=>x.ms===12000);
assert.ok(pressureTick,'12-second Android adaptive pressure interval retained');
ds.state.chatStartupQuietUntil=0;
pressureTick.fn();
assert.strictEqual(doc.domReads,1,'first visible DOM-size sample');
pressureTick.fn();
assert.strictEqual(doc.domReads,1,'subsequent pressure checks reuse DOM-size sample');
assert.ok(ds.state.runtimePerformance.pressureDomSampleReuses>=1);
ds.state.settings.chatPerformanceMode=false;
ds.state.settings.performanceDiagnostics=false;
emit();
assert.strictEqual(forwarded,1,'no extra diagnostic processing after disabling both features');
const browse=intervals.find(x=>x.ms===5000);
assert.ok(browse,'background listing feature remains installed');
let scans=0;
ds.isSingleChatPage=()=>false;
ds.collectCards=()=>{scans++;return[];};
context.location.pathname='/';
browse.fn();browse.fn();
assert.strictEqual(scans,1,'same-page listing scans coalesced');

const b=main.indexOf('function optionalUiQuietDeadline()');
const e=main.indexOf('\n  DS.runSlow =',b);
assert.ok(b>0 && e>b,'quiet calculator is defined');
const quietState={userTypingUntil:10000,nativeActionQuietUntil:14000,chatEnhancerQuietUntil:22000,userScrollingUntil:18000};
const quietCtx={DS:{state:quietState,isSingleChatPage:()=>true}};
vm.runInNewContext(main.slice(b,e)+'\nglobalThis.quiet=optionalUiQuietDeadline;',quietCtx);
assert.strictEqual(quietCtx.quiet(),22000,'latest native or QoL quiet period wins');
quietCtx.DS.isSingleChatPage=()=>false;
assert.strictEqual(quietCtx.quiet(),0,'nonchat pages unaffected');
assert.match(main,/subscribeRuntimeLongTasks\(consumeLongTasks\)/);
assert.match(main,/DS\.syncNativeInputTimingObserver = \(\) =>/);
assert.match(main,/nativeInputObserver\?\.disconnect\?\.\(\)/);
assert.match(main,/sharedQuietScheduleDeferrals/);
assert.match(main,/optionalLaneStaggers/);
assert.match(composer,/if \(state\.pendingComposerHeightRepairs\.has\(textarea\)\) return;/);
assert.match(composer,/if \(textarea\.style\.height === `\$\{wantedHeight\}px`\) return false;/);
assert.match(core,/pendingWriteTouches\(DS\.settingStorageKey\(name\)\)/);
assert.match(core,/persistedSettingsReady/);
console.log('PASS: shared observer, no disabled diagnostics, sampled DOM reuse, unchanged listing skip, quiet coordination, guarded settings writes and composer check');
