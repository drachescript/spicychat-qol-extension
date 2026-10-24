const fs=require('fs');const vm=require('vm');const path=require('path');const {webcrypto}=require('crypto');
const assert=require('assert');
const source=fs.readFileSync(path.resolve(__dirname,'../background/features/background-private-archive-setup-write.js'),'utf8');
const uuid=(s)=>s==='a'?'01a16d87-01bb-7983-9472-72c84b09b3b6':s==='b'?'01a16d89-fe19-7f85-a6c5-f4093c49d769':'11111111-2222-3333-4444-555555555555';
const token='22222222-2222-4222-8222-222222222222';
const jwt=`eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.sig`;
const entry={name:'First Encounter',content:'Hello visitor',keywords:['hello']};
async function hash(e){return Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(e)))).toString('hex')}
async function run(){
 const H=await hash(entry);let posts=0;let rows=[];
 const jobs={['dsQolPrivateJsonCloneWriteV1:'+token]:{token,createdAt:Date.now(),status:'complete',lorebookId:uuid('a'),name:'Nina Weller',expectedEntryHashes:[H],entryProgress:{}}};
 let handler;
 const storage={get(keys,cb){if(typeof keys==='string')keys=[keys];cb(Object.fromEntries(keys.filter(k=>k in jobs).map(k=>[k,jobs[k]])))},set(data,cb){Object.assign(jobs,data);cb&&cb()},remove(key,cb){delete jobs[key];cb&&cb()}};
 const fetchMock=async(url,opts)=>{const p=new URL(url).pathname;
  if(p==='/v2/users')return {ok:true,json:async()=>({user:{id:'account123'}})};
  if(p.includes('/entries')){posts++;const item={...entry,id:'99999999-9999-4999-8999-999999999999'};rows.push(item);return {ok:true,json:async()=>item};}
  if(p.startsWith('/lorebooks/'))return {ok:true,json:async()=>({id:uuid('a'),creator_user_id:'account123',name:'Nina Weller',visibility:'private',num_entries:rows.length,entries:rows.slice()})};
  throw Error('Unexpected request '+url);
 };
 const ctx={chrome:{storage:{local:storage},runtime:{}},crypto:webcrypto,fetch:fetchMock,AbortController,atob:x=>Buffer.from(x,'base64').toString('binary'),TextEncoder,URL,Date,setTimeout,clearTimeout,console,dsqRegisterBackgroundMessageHandler:(type,owner,fn)=>{handler=fn;}};
 vm.runInNewContext(source,ctx);
 const page=`https://spicychat.ai/lorebook/edit/${uuid('a')}/entries`,path=`/lorebooks/${uuid('a')}/entries`;
 const send=(payload={...entry},p=path,url=page,tk=token)=>new Promise(resolve=>handler({method:'POST',path:p,payload,setupToken:tk,authToken:jwt,appVersion:'4.7.3'},{tab:{id:4,url},url},resolve));
 let v=await send();assert.strictEqual(v.ok,true,JSON.stringify(v));assert.strictEqual(v.status,'created');assert.strictEqual(posts,1);
 v=await send();assert.strictEqual(v.ok,true);assert.strictEqual(v.status,'already-exists');assert.strictEqual(posts,1);
 v=await send({...entry,name:'Unauthorized'});assert.strictEqual(v.ok,false);assert.strictEqual(v.status,'entry-not-in-approved-json');
 v=await send(entry,`/lorebooks/${uuid('b')}/entries`);assert.strictEqual(v.ok,false);assert.strictEqual(v.status,'blocked');
 assert.strictEqual(jobs['dsQolPrivateJsonCloneWriteV1:'+token].entryProgress[H],'verified');
 console.log('PASS: create, dedup, content authorization, strict destination, and persisted progress');
}
run().catch(e=>{console.error(e);process.exit(1)});
