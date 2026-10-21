'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'background/events/alarms.js'),'utf8');
const hooks=[
  ['performance-mode','background/background-auto-afk.js','ds-auto-afk-scan-v1'],
  ['chat-nudges','background/features/background-notifications.js','ds-chat-nudge-scan-v1'],
  ['creator-workspace','background/features/background-creator-watch.js','ds-creator-bot-watch-v1'],
  ['list-fill','background/features/background-worker-less-like.js','ds-listing-refill-worker-gc'],
  ['bot-blocking','background/features/background-feedback-history.js','ds-quick-dislike-worker-gc'],
];
assert(!source.includes('if (alarm.name === AUTO_AFK_ALARM)'),'Autonomous alarm left in shared event switch');
for(const [owner,file,name] of hooks){
  const code=fs.readFileSync(path.join(root,file),'utf8');
  assert(code.includes(`owner: "${owner}"`),`${owner}: owner not registered`);
  assert(code.includes(`["${name}"]`),`${owner}: alarm not registered`);
}
let listener,called=[];
const globalThis={__DSQ_BACKGROUND_ALARM_HANDLERS__:{}};
for(const [owner,,name] of hooks){globalThis.__DSQ_BACKGROUND_ALARM_HANDLERS__[name]={owner,run:()=>called.push(owner)};}
const env={globalThis, chrome:{alarms:{onAlarm:{addListener:cb=>listener=cb}}},
  dsqBackgroundHasFeature:id=>id!=='chat-nudges',
  tabIdFromAlarm:()=>null,activeLoaders:new Set(),stopLoader(){},scheduleLoadStep(){},
};
vm.createContext(env);
vm.runInContext(source+'\nregisterQolBackgroundAlarms();',env);
for(const [, ,name] of hooks)listener({name});
assert.deepEqual(called,['performance-mode','creator-workspace','list-fill','bot-blocking']);
console.log('PASS: optional alarm routing, omitted owner ignored, no unguarded calls');
