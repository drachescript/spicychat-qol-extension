'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const central = read('background/events/runtime-messages.js');
for(const marker of ['if (message?.type === "DS_DEEPL_TRANSLATE"','if (message?.type === "DS_WIKI_FETCH"', 'if (message?.type === "DS_DEEPL_TEST"']) {
  assert(!central.includes(marker), `${marker} still routed in shared listener`);
}
assert(central.includes('dsqBackgroundFeatureMessageHandlers'), 'router does not use feature handlers');

function harness(installed) {
  let listener;
  const calls = [];
  const chrome = {
    runtime: { onMessage: { addListener(fn) { listener = fn; } } },
    permissions: { request({origins}, callback) { callback(true); }, contains({origins}, cb) { cb(true); } }
  };
  const ctx = vm.createContext({chrome, URL, AbortController, setTimeout, clearTimeout,
    dsqBackgroundHasFeature: owner => installed.includes(owner),
    storageLocalGet: async () => ({ deeplApiKey: 'test:fx', dsLibreTranslateKeyV1:'fake' }),
    fetch: async url => {
      calls.push(url);
      if (url.includes('/v2/usage')) return {ok:true,json:async()=>({character_count:100,character_limit:1000})};
      if (url.includes('/v2/translate')) return {ok:true,json:async()=>({translations:[{text:'Hello',detected_source_language:'DE'}]})};
      return {ok:true, url,headers:{get:()=> 'text/html'},text:async()=>'<html>Article content</html>'};
    }
  });
  vm.runInContext(read('background/feature-message-ownership.js'), ctx);
  vm.runInContext(read('background/background-translation.js'), ctx);
  vm.runInContext(read('background/background-wiki-fetch.js'), ctx);
  assert.deepEqual(Object.keys(vm.runInContext('dsqBackgroundFeatureMessageHandlers',ctx)).length,
    (installed.includes('translation') ? 5 : 0)+(installed.includes('wiki-lorebook-importer') ? 2 : 0));
  vm.runInContext(central,ctx);
  vm.runInContext('registerQolBackgroundRuntimeMessages()',ctx);
  return {async request(type, other={}){
    let finish;
    const done = new Promise(resolve => {finish=resolve;});
    const asyncReturn = listener({type,...other},{},finish);
    const result = await Promise.race([done,new Promise(resolve=>setTimeout(()=>resolve('__timeout__'),400))]);
    return {asyncReturn,result};
  },calls};
}
(async()=>{
  const included = harness(['translation','wiki-lorebook-importer']);
  const test = await included.request('DS_DEEPL_TEST');
  assert.equal(test.asyncReturn,true);
  assert.equal(test.result.ok,true);
  assert.equal(test.result.characterLimit,1000);
  const translate = await included.request('DS_DEEPL_TRANSLATE',{text:'Hallo',targetLang:'EN-US'});
  assert.equal(translate.result.text,'Hello');
  const fetched = await included.request('DS_WIKI_FETCH',{url:'https://example.com/page'});
  assert.equal(fetched.result.ok,true);
  assert.match(fetched.result.html,/Article content/);
  const denied = harness([]);
  for(const type of ['DS_DEEPL_TEST','DS_DEEPL_TRANSLATE','DS_WIKI_FETCH','DS_WIKI_REQUEST_PERMISSION']){
    const result = await denied.request(type);
    assert.equal(result.asyncReturn,false);
    assert.equal(result.result.ok,false);
    assert.match(result.result.error,/not installed/);
  }
  assert.equal(denied.calls.length,0,'omitted module made a network call');
  console.log('PASS: feature-owned translation/wiki background dispatch, responses, omitted-module safety');
})().catch(error=>{console.error(error);process.exitCode=1;});
