#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'settings/features/options-diagnostics.js'), 'utf8');
const start = source.indexOf('function isAndroidSupportWebView()');
const end = source.indexOf('async function downloadSupportText(', start);
assert(start >= 0 && end > start, 'support helper section missing');
function makeContext({android = true, handlers = {}, copied = true} = {}) {
  const box = {value: '', focusCalled: false, selected: false,
    focus() {this.focusCalled = true;}, select() {this.selected = true;}};
  const bridge = android ? {
    callHandler: async (name, payload) => handlers[name] ? handlers[name](JSON.parse(payload)) : (() => {throw Error('No handler');})()
  } : null;
  const context = { setTimeout, clearTimeout, window: {flutter_inappwebview: bridge}, navigator: {
      userAgent: android ? 'Mozilla/5.0 (Linux; Android 16; wv)' : 'Mozilla/5.0 Desktop',
      clipboard: copied ? {writeText: async () => {}} : {writeText: async () => {throw Error('blocked');}}
    }, $: () => box, setActiveTab: () => {}, box };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nthis.helpers={isAndroidSupportWebView,requestAndroidSupportFile,preserveAndroidSupportFallback}`, context);
  return context;
}
async function run() {
  {
    const ctx = makeContext({handlers: {exportChat: ({text, filename}) => {
      assert.equal(text, 'PRIVATE-REPORT'); assert.equal(filename, 'report.txt');
      return undefined; // older Android handlers sometimes provide no receipt
    }}});
    assert.equal(ctx.helpers.isAndroidSupportWebView(), true);
    assert.equal(await ctx.helpers.requestAndroidSupportFile('PRIVATE-REPORT', 'report.txt'), true);
  }
  {
    const ctx = makeContext({handlers: {
      exportChat: () => ({ok: false}),
      saveFile: ({text, filename}) => {assert.equal(text, 'text'); assert.equal(filename, 'report.txt'); return {ok: true};}
    }});
    assert.equal(await ctx.helpers.requestAndroidSupportFile('text', 'report.txt'), true);
  }
  {
    const ctx = makeContext({copied:false});
    assert.equal(await ctx.helpers.requestAndroidSupportFile('text', 'report.txt'), false);
    const result = await ctx.helpers.preserveAndroidSupportFallback('text');
    assert.equal(result.copied, false);
    assert.equal(ctx.box.value, 'text');
    assert.equal(ctx.box.selected, true);
  }
  {
    const ctx = makeContext({android:false});
    assert.equal(ctx.helpers.isAndroidSupportWebView(), false);
  }
  // The slower saved-history backend must not veto a fresh support export.
  const fnStart = source.indexOf('async function downloadAllSupportInfo()');
  const fnEnd = source.indexOf('async function runPerformanceSelfCheck(', fnStart);
  assert(fnStart >= 0 && fnEnd > fnStart, 'support download section missing');
  const status = {textContent:''};
  const exportContext = {
    $: () => status,
    readSavedSupportHistory: async () => ({ok: false, text:'history unavailable', count:0}),
    buildAllSupportInfo: async ({history}) => {
      assert.equal(history.ok, false);
      return 'SpicyChat QoL support info\nHistory unavailable';
    },
    TextEncoder,
    downloadSupportVerified: async () => ({started:true, verified:false, isGzip:false}),
    isAndroidSupportWebView: () => true,
    lastAndroidSupportExportState: "copied",
    refreshSavedSupportStatus: async () => {},
    runtimeMessageWithTimeout: () => {throw Error('must not delete saved history');},
  };
  vm.createContext(exportContext);
  vm.runInContext(`${source.slice(fnStart, fnEnd)}\nthis.run=downloadAllSupportInfo;`, exportContext);
  assert.equal(await exportContext.run(), true);
  assert.match(status.textContent, /history was kept/i);

  const mainSource = fs.readFileSync(path.join(root, 'content/main.js'), 'utf8');
  const deferStart = mainSource.indexOf('let androidChatListQuietRoute =');
  const deferEnd = mainSource.indexOf('async function runSavedOpenedLane(', deferStart);
  assert(deferStart >= 0 && deferEnd > deferStart, 'Android list warmup missing');
  let now = 10000;
  const scheduled=[];
  const counts={};
  const workContext={
    Date: {now: () => now}, location: {pathname:'/chats'},
    androidWebViewPerformanceGuardActive:()=>true,
    runtimeCounters:()=>counts,
    scheduleSavedOpenedLane:(name, delay)=>scheduled.push([name,delay]),
  };
  vm.createContext(workContext);
  vm.runInContext(`${mainSource.slice(deferStart, deferEnd)}\nthis.defer = deferAndroidChatListWorkForFirstPaint;`,workContext);
  assert.equal(workContext.defer(),true);
  assert.equal(scheduled.length, 1);
  assert(scheduled[0][1]>=1500);
  now += 1700;
  assert.equal(workContext.defer(),false);
  assert.equal(scheduled.length, 1);
  workContext.location.pathname = '/chats/folder-2';
  assert.equal(workContext.defer(),true);
  console.log('PASS: Android file-export attempts, native fallback, preserved support history, and /chats first-paint deferral');
}
run().catch(error => {console.error(error);process.exitCode=1;});
