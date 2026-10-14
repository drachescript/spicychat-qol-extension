'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','content','bot-archive.js'),'utf8');
async function testScenario() {
  const archives={}; let requests=0, writes=0, calls=0;
  const timers=new Map();let last=0;let clock=0;
  const drain=async()=>{
    let guard=0;
    while(timers.size){
      if(++guard>40)throw Error('timer recursion');
      const [id,t]=[...timers.entries()].sort((a,b)=>a[1].due-b[1].due)[0];
      clock=t.due; timers.delete(id); t.cb();
      await new Promise(setImmediate);
      await new Promise(setImmediate);
    }
  };
  const DS={state:{settings:{enabled:true,botArchiveRememberSeenPublic:true},runtimePerformance:{}},
    botIdFromHref:s=>/\/chat\/(.{36})/.exec(s)?.[1],
    getCardTitle:card=>card.name,
    getCardImageUrl:card=>card.img,
    largeStorageGetRecords:async(_key,ids)=>Object.fromEntries(ids.filter(id=>archives[id]).map(id=>[id,archives[id]])),
    largeStorageMerge:async(_key,updates)=>{Object.assign(archives,updates);writes++;return true;},
    diagEvent:()=>{}}
  const context={window:{DragonScriptQoL:DS,__DSQ_TAB_GATE__:{}},chrome:{runtime:{onMessage:{addListener(){}}}},location:{pathname:'/',origin:'https://spicychat.ai'},document:{},console,Date,URL,Node:{},
    setTimeout:(cb,ms)=>{last++;timers.set(last,{cb,due:clock+ms});return last},clearTimeout:(id)=>{timers.delete(id)},setInterval:()=>{throw Error('unexpected interval')},
    fetch:async()=>{requests++;return null;}}
  vm.runInNewContext(source,context,{filename:'bot-archive.js'});
  const makeCard=i=>{const id=(i+10).toString(16).padStart(8,'0')+'-1111-4111-8111-000000000000';return {anchor:{href:`https://spicychat.ai/chat/${id}`},card:{isConnected:true,name:`Bot ${i}`,img:`https://cdn.nd-api.com/avatars/${i}.png`,querySelector(selector){if(selector.includes('/creator/'))return {getAttribute:()=>'/creator/example-creator'};return null}},id}}
  const pairs=Array.from({length:69},(_,i)=>makeCard(i));
  assert.equal(DS.rememberListedBotCards(pairs),69);
  assert.equal(DS.rememberListedBotCards(pairs),0,'repeat cache no duplicate processing');
  assert.equal(Object.keys(archives).length,0,'must not synchronously write during startup');
  await drain();
  assert.equal(Object.keys(archives).length,69,'all visible bot IDs saved locally');
  assert.equal(requests,0,'must not fetch every visible bot profile');
  assert.equal(writes,1,'cards should merge into one deferred storage batch');
  assert.equal(archives[pairs[0].id].source,'Listing discovery');
  assert.equal(archives[pairs[0].id].fields.name,'Bot 0');
  assert.equal(DS.rememberListedBotCards(pairs),0);
  const newCard=makeCard(70);newCard.card.name='';newCard.card.img='';
  assert.equal(DS.rememberListedBotCards([newCard]),1);
  await drain();
  assert.equal(archives[newCard.id],undefined,'loading placeholder must not be archived');
  newCard.card.name='New Bot';
  assert.equal(DS.rememberListedBotCards([newCard]),1,'placeholder should retry after hydration');
  await drain();
  assert.equal(archives[newCard.id].fields.name,'New Bot');
  DS.state.settings.botArchiveRememberSeenPublic=false;
  const disabled=makeCard(72);assert.equal(DS.rememberListedBotCards([disabled]),0);
  assert.equal(archives[disabled.id],undefined,'respects opt-out');
  console.log(JSON.stringify({cases:'pass',saved:70,requestCount:requests,storageBatches:writes,deferred:true,disabledRespected:true,loadingRetry:true}));
}
testScenario().catch(e=>{console.error(e.stack||e);process.exitCode=1})
