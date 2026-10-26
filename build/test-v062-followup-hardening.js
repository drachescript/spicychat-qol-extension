'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const i = source.indexOf(marker);
  assert(i >= 0, `Missing ${name}`);
  const start = source.indexOf('{', i);
  let depth = 0, quote = '', escaped = false;
  for (let j = start; j < source.length; j++) {
    const c = source[j];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0 && c === '}') return source.slice(i, j + 1);
    if (c !== '}') depth += c === '}' ? -1 : 0;
  }
  throw Error(`Unterminated ${name}`);
}
async function testHistoryAccess() {
  const source = fs.readFileSync(path.join(root,'background/features/background-diagnostics.js'),'utf8');
  // Extract only the message guard to avoid initializing a real Chrome worker.
  const declaration = source.slice(source.indexOf('function dsqSupportHistoryRequest('));
  const fn = declaration.slice(0, declaration.indexOf('\n}', declaration.indexOf('{')) + 2);
  assert(fn.includes('sender?.id === chrome.runtime.id'));
  const ctx = {
    chrome: {runtime:{id:'extension-A', getURL: p=>'chrome-extension://extension-A/'+p}},
    dsqSupportSerial: fn => Promise.resolve(fn()),
    dsqSupportExport: () => ({ok:true,count:7}),
    dsqSupportClear: () => ({ok:true}),
    dsqSupportAppend: () => ({ok:true})
  };
  vm.createContext(ctx);vm.runInContext(fn, ctx);
  const request = sender => new Promise(resolve=>{
    const keepAlive = ctx.dsqSupportHistoryRequest({type:'DS_SUPPORT_HISTORY_GET'},sender,resolve);
    if (!keepAlive) Promise.resolve().then(()=>{});
  });
  const good = await request({id:'extension-A',url:'chrome-extension://extension-A/options.html'});
  assert.equal(good.ok,true);
  const noUrl = await request({id:'extension-A'});
  assert.equal(noUrl.ok,true);
  const tab = await request({id:'extension-A',url:'https://spicychat.ai/chat/test',tab:{id:5}});
  assert.equal(tab.ok,false);
  const foreign = await request({id:'other-extension',url:'chrome-extension://other-extension/options.html'});
  assert.equal(foreign.ok,false);
  const fake = await request({id:'other-extension',url:'chrome-extension://extension-A/options.html'});
  assert.equal(fake.ok,false); // Even a claimed extension URL cannot override sender identity.
}
async function testCountersAndScope() {
  const source=fs.readFileSync(path.join(root,'content/main.js'),'utf8');
  const functionText = source.slice(source.indexOf('function listingSafeStepGroup('),source.indexOf('\n  async function runRoutedFeatureStep(',source.indexOf('function listingSafeStepGroup(')));
  const counts={}; const DS={state:{settings:{}}};let now=1000;
  const ctx={DS,Date:{now:()=>now}, location:{href:'https://spicychat.ai/chatbot/x'},deepSleepEnabled:()=>true,
    runFeatureStep:async(_,wanted,fn)=>wanted ? fn() : null, runtimeCounters:()=>counts, slowStepThrottle:new Map()};
  vm.createContext(ctx); vm.runInContext(functionText,ctx);
  let called=0;
  await ctx.runThrottledFeatureStep('bot profile creation date',false,2000,()=>called++);
  assert.equal(counts.slowStepThrottleSkips||0,0);
  assert.equal(called,0);
  await ctx.runThrottledFeatureStep('bot profile creation date',true,2000,()=>called++);
  await ctx.runThrottledFeatureStep('bot profile creation date',true,2000,()=>called++);
  assert.equal(called,1);
  assert.equal(counts.slowStepThrottleCategories.profile,1);
  now=3500;
  await ctx.runThrottledFeatureStep('bot profile creation date',true,2000,()=>called++);
  assert.equal(called,2);
  assert.equal(counts.throttledStepRuns,2);
  const report = fs.readFileSync(path.join(root,'settings/features/options-diagnostics.js'),'utf8');
  assert(report.includes('Sample scope: ${sampleScope}'));
  assert(report.includes('checks prevented (not completed scans)') || report.includes('checks prevented (not completed scans)'.replace('checks','repeated checks')));
  assert(report.includes('individual feature dispatches (several per pass)'));
}
Promise.all([testHistoryAccess(), testCountersAndScope()]).then(()=>console.log('PASS: private Support History scope, no-tab Settings fallback, actual vs throttled work, hidden-tab report context')).catch(error=>{console.error(error);process.exitCode=1;});
