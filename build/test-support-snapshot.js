"use strict";
// Regression test: all sections of one support export see one live runtime
// snapshot, while a later export makes a fresh request.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const foundation = fs.readFileSync("settings/features/options-foundation.js", "utf8");
const start = foundation.indexOf("let supportRuntimeSnapshotPromise = null;");
const end = foundation.indexOf("function promiseWithSupportTimeout(", start);
assert(start !== -1 && end !== -1);
const context = vm.createContext({
  setTimeout, clearTimeout, Promise,
  calls: 0,
  runtimeMessage: async function () { this.calls++; return { runtimeAvailable: true, pageDiagnostics: { counter: this.calls } }; }
});
// Use a lexical function whose call count lives in the context.
vm.runInContext(`let callCount = 0; function runtimeMessage() { callCount += 1; return Promise.resolve({ count: callCount, pageDiagnostics: { mounted: 12 } }); }\n${foundation.slice(start,end)}`, context);
(async () => {
  const results = await vm.runInContext(`withSharedSupportRuntimeSnapshot(async () => {
    const [a,b,c] = await Promise.all([
      runtimeMessageWithTimeout({type:'DS_GET_DIAGNOSTIC_CONTEXT'}),
      runtimeMessageWithTimeout({type:'DS_GET_DIAGNOSTIC_CONTEXT'}),
      runtimeMessageWithTimeout({type:'DS_GET_DIAGNOSTIC_CONTEXT'})
    ]);
    return [a.count,b.count,c.count,callCount];
  })`, context);
  assert.deepEqual([...results], [1,1,1,1]);
  const again = await vm.runInContext(`runtimeMessageWithTimeout({type:'DS_GET_DIAGNOSTIC_CONTEXT'})`,context);
  assert.equal(again.count, 2);
  const overlapping = await vm.runInContext(`Promise.all([
    withSharedSupportRuntimeSnapshot(async () => {
      await Promise.resolve();
      const result = await runtimeMessageWithTimeout({type:'DS_GET_DIAGNOSTIC_CONTEXT'});
      await Promise.resolve();
      return result.count;
    }),
    withSharedSupportRuntimeSnapshot(async () => {
      const result = await runtimeMessageWithTimeout({type:'DS_GET_DIAGNOSTIC_CONTEXT'});
      return result.count;
    })
  ])`, context);
  assert.deepEqual([...overlapping], [3,3]);
  const diagnostics = fs.readFileSync("settings/features/options-diagnostics.js", "utf8");
  assert(diagnostics.includes("return withSharedSupportRuntimeSnapshot(async () => {"));
  assert(diagnostics.includes("chatUnexpectedEmptyRecovered"));
  console.log("Support snapshot sharing and incident reporting: PASS");
})().catch(error => { console.error(error); process.exitCode = 1; });
