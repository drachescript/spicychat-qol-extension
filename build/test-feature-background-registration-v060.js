'use strict';
// Registration-only smoke test: browser/authenticated API behavior is NOT simulated here.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const modules={
 'context-keeper':['background/features/background-context-keeper-storage.js','DS_CONTEXT_KEEPER_MUTATE'],
 'chat-lorebook-manager':['background/features/background-chat-lorebook-local.js','DS_CHAT_LOREBOOK_MUTATE'],
 'native-memory-probe':['background/features/background-native-memory-probe.js','DS_NATIVE_MEMORY_PROBE']
};
function registry(features){
 const ctx=vm.createContext({URL,Date,Map,Set,Promise,JSON,Error,RegExp,console,crypto:require('node:crypto').webcrypto,AbortController,setTimeout,clearTimeout,
  dsqBackgroundHasFeature:owner=>features===null||features.includes(owner)});
 for(const file of ['background/feature-message-ownership.js',...Object.values(modules).map(x=>x[0])])
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
 return Array.from(vm.runInContext('Object.keys(dsqBackgroundFeatureMessageHandlers)',ctx)).sort();
}
assert.deepEqual(registry([]),[]);
for(const [feature,[asset,type]] of Object.entries(modules)){
 assert.equal(registry([feature]).length,1,`wrong handler count for ${feature}`);
 assert.deepEqual(registry([feature]),[type]);
 const contract=JSON.parse(fs.readFileSync(path.join(root,'build/features',feature+'.json'),'utf8'));
 assert(contract.backgroundFiles.includes(asset));
 assert.equal(contract.backgroundIsolated,false,'A source contract cannot certify browser verification');
}
assert.deepEqual(registry(null),Object.values(modules).map(x=>x[1]).sort());
const entry=fs.readFileSync(path.join(root,'background-entry.js'),'utf8');
for(const [path] of Object.values(modules))assert(entry.includes('"'+path+'"'));
const old=fs.readFileSync(path.join(root,'background/features/background-storage.js'),'utf8');
for(const [,type] of Object.values(modules))assert(!old.includes(`'${type}'`)&&!old.includes(`"${type}"`));
const native=JSON.parse(fs.readFileSync(path.join(root,'build/features/native-memory-probe.json'),'utf8'));
assert(native.dependencies.includes('generation-metadata'));
assert(fs.existsSync(path.join(root,native.settingsFiles[0])));
console.log('PASS: v0.2.60 feature-owned background handler registration and Native Memory independence');
