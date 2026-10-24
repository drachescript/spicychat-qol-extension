'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'background/features/background-lorebook-cover.js'), 'utf8');
const entry = fs.readFileSync(path.join(root, 'background-entry.js'), 'utf8');
const owners = fs.readFileSync(path.join(root,'background/feature-message-ownership.js'),'utf8');
assert(entry.includes('background/features/background-lorebook-cover.js'));
assert(owners.includes('"DS_LOREBOOK_COVER_FETCH": "lorebook-backup"'));
const validPng = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
async function runCase(rawUrl, senderUrl, opts={}) {
  let handler, calls=[];
  const ctx = vm.createContext({
    URL, Uint8Array, AbortController, setTimeout, clearTimeout, btoa,
    dsqRegisterBackgroundMessageHandler(type, owner, fn) {
      assert.equal(type,'DS_LOREBOOK_COVER_FETCH');assert.equal(owner,'lorebook-backup');handler=fn;
    },
    async fetch(url, options) {
      calls.push({url,options});
      const content = opts.bytes || validPng;
      const primaryDenied = opts.primaryStatus && !url.includes('?class=avatar256x256');
      return {
        ok:(!primaryDenied && opts.ok!==false),status:primaryDenied?opts.primaryStatus:(opts.status||200),url:opts.redirect||url,
        headers:{get:key=>({ 'content-type':opts.type||'image/png','content-length':String(content.byteLength) })[key]||null},
        body:{getReader() {let used=false;return {
          async read() {if(used)return {done:true};used=true;return {done:false,value:content};},
          async cancel(){return;}
        };}}
      };
    }
  });
  vm.runInContext(src,ctx);
  let reply;
  const wait = new Promise(resolve=>reply=resolve);
  const isAsync = handler({url:rawUrl},{url:senderUrl},reply);
  if(isAsync) return {result:await wait,calls,isAsync};
  return {result:await wait,calls,isAsync};
}
(async()=>{
  const sender='https://spicychat.ai/lorebook/edit/01a1638c-7501-7798-a69f-d5e676e3464c/entries';
  const png='avatars/d7ae84d9-25ec-4439-aa81-c478df9cad77.png';
  const good = await runCase(png,sender);
  assert.equal(good.result.ok,true);
  assert.equal(good.calls.length,1);
  assert.equal(good.calls[0].url,'https://cdn.nd-api.com/'+png);
  assert.equal(good.calls[0].options.credentials,'omit');
  assert.equal(good.calls[0].options.redirect,'error');
  assert.equal(good.result.dataUrl,'data:image/png;base64,'+Buffer.from(validPng).toString('base64'));
  const nativeVariant = await runCase(png,sender,{primaryStatus:403});
  assert.equal(nativeVariant.result.ok,true,'known first-party variant should work after original is denied');
  assert.equal(nativeVariant.result.variant,'avatar256x256');
  assert.equal(nativeVariant.calls.length,2);
  assert.equal(nativeVariant.calls[1].url, 'https://cdn.nd-api.com/'+png+'?class=avatar256x256');
  assert.equal(nativeVariant.calls[1].options.credentials,'omit');
  for(const url of ['https://evil.example/avatars/a.png','https://cdn.nd-api.com/anything.png',
    'https://cdn.nd-api.com/avatars/../../other.png','http://cdn.nd-api.com/avatars/a.png',
    'https://cdn.nd-api.com/avatars/a.png?q=hi']) {
    const bad=await runCase(url,sender);
    assert.equal(bad.result.ok,false,url);
    assert.equal(bad.calls.length,0,url);
  }
  const badSender=await runCase(png,'https://spicychat.ai/chats');
  assert.equal(badSender.result.ok,false);assert.equal(badSender.calls.length,0);
  const wrongType=await runCase(png,sender,{type:'text/html'});
  assert.equal(wrongType.result.ok,false);
  const wrongMagic=await runCase(png,sender,{bytes:Uint8Array.from([1,2,3])});
  assert.equal(wrongMagic.result.ok,false);
  const redirected=await runCase(png,sender,{redirect:'https://cdn.nd-api.com/avatars/elsewhere.png'});
  assert.equal(redirected.result.ok,false);
  const tooLarge=await runCase(png,sender,{bytes:new Uint8Array(2*1024*1024+1)});
  assert.equal(tooLarge.result.ok,false);
  const json=JSON.parse(fs.readFileSync('/mnt/data/Nina Weller-lorebook-backup.json','utf8'));
  assert.equal(json.completeness.entries,true);
  assert.equal(json.completeness.imageEmbedded,false);
  assert.equal(json.entries.length,json.lorebook.entryCount);
  assert.equal(json.lorebook.image,png);
  console.log('PASS: Lorebook first-party cover fallback accepts the saved avatar reference and rejects unsafe hosts, redirects, types and oversized files');
})().catch(e=>{console.error(e);process.exitCode=1});
