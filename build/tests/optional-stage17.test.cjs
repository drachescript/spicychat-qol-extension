const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
let cases=0;
function loader(url, search, settings, installed=()=>true){
 const DS={state:{settings},featureBuildProfile:{isInstalled:installed},getPageState:()=>({}),isQolPausedForTab:()=>false};
 const ctx={window:{DragonScriptQoL:DS},location:{pathname:url,href:'https://spicychat.ai'+url+search,search},URLSearchParams,chrome:{runtime:{getURL:x=>x}},performance,console};
 vm.runInNewContext(fs.readFileSync(path.join(root,'content/on-demand-modules.js'),'utf8'),ctx);
 return {DS,ctx,wanted:Array.from(DS.optionalModuleLoader.wanted(settings,url))};
}
const UUID='3131dc3e-e3a1-48f9-aa25-a1ea9058b6b4';
function expect(route,query,s,includes=[],excludes=[],installed=()=>true){
 const x=loader(route,query,{enabled:true,...s},installed).wanted;
 for(const n of includes){assert(x.includes(n),`missing ${n} on ${route} found ${x}`);cases++}
 for(const n of excludes){assert(!x.includes(n),`unexpected ${n} on ${route}`);cases++}
}
expect(`/chat/${UUID}`,'',{enableStoryDayTracker:true,enableRpStateTracker:true,showChatSearch:true,enableSelectionRemember:true,enableChatNudges:true,enableRulebookDiagnostics:true,enableSavedTextSnippets:true,enableFocusMode:true},['story-day-tracker','rp-state-tracker','chat-search','selection-memory','chat-nudges','rulebook-diagnostics','saved-snippets','focus-mode'],['chat-organizer']);
expect('/chats','',{enableChatOrganizer:true,enableChatPins:true,enableChatSmartFolders:true},['chat-organizer','chat-pins','chat-smart-folders'],['story-day-tracker']);
expect('/chats','?ds-research-export=1',{enableChatOrganizer:true,enableChatSmartFolders:true,showQuickPanel:true},['bulk-chat-research'],['chat-organizer','chat-smart-folders','quick-panel']);
expect(`/chat/${UUID}`,'?dsQuickDislike=1',{enableStoryDayTracker:true,showQuickPanel:true},[],['story-day-tracker','quick-panel']);
expect(`/chat/${UUID}`,'?dsQuickLessLike=1',{enableStoryDayTracker:true,showQuickPanel:true},[],['story-day-tracker','quick-panel']);
expect(`/chatbot/${UUID}/edit`,'',{enableBotEditorDraftHistory:true,botEditorShowCharButton:true,creatorModerationWarnings:true},['bot-editor-history','bot-editor-snippets','creator-moderation-warnings'],['chat-search']);
expect(`/lorebook/edit/${UUID}`,'',{lorebookEditShortcuts:true,creatorModerationWarnings:true,showLorebookConnections:true},['lorebook-workflow','lorebook-moderation-review','creator-moderation-warnings','lorebook-connections']);
expect('/my-creations/chatbots','',{enableMyCreationsFilters:true,creatorModerationWarningsChatbots:true},['my-creations-filters','creator-moderation-warnings'],['chat-pins']);
expect('/favorite-bots','',{},[],['lorebook-workflow','chat-organizer','chat-smart-folders','creator-moderation-warnings']);
expect(`/chat/${UUID}`,'',{showChatSearch:true},[],['chat-search'],x=>x!=='chat-search');
let no=loader('/', '', {enabled:true});assert.equal(no.wanted.length,0);cases++;
const script=fs.readFileSync(path.join(root,'content/cards.js'),'utf8');
const counters={name:0,description:0};const state={settings:{enabled:true,blockCards:true,autoBlockWordMatches:true,autoBlockTagMatches:false},preparedMatchers:{blockedWords:[{raw:'TF141',needle:'tf141',compact:'tf141',tokens:['tf141']}],blockedNames:[{raw:'TF141',needle:'tf141',compact:'tf141',tokens:['tf141']}],blockedTags:[]},runtimePerformance:{},cardFilterStateRevision:1};
const DS={state, qsa:()=>[],searchableTextForMatching:x=>String(x||'').toLowerCase().replace(/\s+/g,' ').trim(),normalize:x=>String(x||'').toLowerCase().trim(),getCardTitle:()=>{counters.name++;return 'task force 141';},getCardDescriptionText:()=>{counters.description++;return 'the team TF 141';},getCardTags:()=>[],isFavoriteBotsPage:()=>false,isRecommendationCardRoot:()=>false,botIdFromHref:()=>null,chatIdFromHref:()=>null,pendingBlockedBotAdds:new Map()};
const win={DragonScriptQoL:DS};const ctx={window:win,location:{href:'https://spicychat.ai/',pathname:'/'},document:{querySelector:()=>null,addEventListener:()=>{}},performance,console,setTimeout,Element:class{}};
vm.runInNewContext(script,ctx);
const card={textContent:'task force 141',querySelector:()=>null,querySelectorAll:()=>[],className:'',dataset:{}};
let a=DS.getVerifiedCardAutoBlockMatches(card);assert.equal(a.word.raw,'TF141');cases++;
const oneRead=counters.description;DS.getVerifiedCardAutoBlockMatches(card);assert.equal(counters.description,oneRead+1,'persistent block confirmation must re-read native metadata');cases++;
const first=counters.description;DS.shouldHideBlockedBot(card,{href:''});DS.shouldHideBlockedBot(card,{href:''});assert.equal(counters.description,first+1,'unchanged card not cached');cases++;
card.textContent='team TF 141 updated';DS.shouldHideBlockedBot(card,{href:''});assert.equal(counters.description>first,true,'card content change should invalidate');cases++;
const second=counters.description;state.cardFilterStateRevision++;DS.shouldHideBlockedBot(card,{href:''});assert.equal(counters.description>second,true,'filter revision should invalidate');cases++;
let before=state.runtimePerformance.cardMetadataCacheHits;assert(before>=1);cases++;
// A module imported after the privacy guard's original startup window must
// still be wrapped before it can examine a private editor.
let moderationRuns=0, moderationCleanups=0, lorebookReads=0;
const privateSettings={enabled:true,lorebookProtectEntryDrafts:true,lorebookEntryManager:true};
const privateDS={state:{settings:privateSettings},scheduleRun:()=>{}};
const privateButton={getAttribute:key=>key==='aria-pressed'?'true':''};
const privateCtx={
 window:{DragonScriptQoL:privateDS,addEventListener:()=>{}},
 location:{pathname:`/lorebook/edit/${UUID}`,search:''},URLSearchParams,console,
 document:{documentElement:{dataset:{}},body:{textContent:''},
  addEventListener:()=>{},querySelector:selector=>selector.includes('LorebookVisibilityField-PrivateButton')?privateButton:null,
  querySelectorAll:()=>[]},
 setTimeout:()=>0,Element:class{}
};
vm.runInNewContext(fs.readFileSync(path.join(root,'content/creator-editor-privacy-guard.js'),'utf8'),privateCtx);
privateDS.applyCreatorModerationWarnings=()=>{moderationRuns++;};
privateDS.removeCreatorModerationWarnings=()=>{moderationCleanups++;};
privateDS.applyLorebookWorkflowTools=()=>{
 lorebookReads++;
 assert.equal(privateSettings.lorebookProtectEntryDrafts,false);cases++;
 assert.equal(privateSettings.lorebookEntryManager,false);cases++;
};
privateDS.installCreatorEditorPrivacyGuards();
privateDS.applyCreatorModerationWarnings();
assert.equal(moderationRuns,0);cases++;
assert.equal(moderationCleanups,1);cases++;
privateDS.applyLorebookWorkflowTools();
assert.equal(lorebookReads,1);cases++;
assert.equal(privateSettings.lorebookProtectEntryDrafts,true);cases++;
assert.equal(privateSettings.lorebookEntryManager,true);cases++;
// Packaging contract: each on-demand source exists, belongs to the Full bundle
// map, is web-accessible, and is absent from eager registration.
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const registry=JSON.parse(fs.readFileSync(path.join(root,'build/modules.json'),'utf8'));
const eager=manifest.content_scripts.flatMap(item=>item.js||[]);
const resources=new Set(manifest.web_accessible_resources.flatMap(item=>item.resources||[]));
const owned=new Set(Object.values(registry.bundles).flatMap(bundle=>bundle.files||[]));
const loaderSource=fs.readFileSync(path.join(root,'content/on-demand-modules.js'),'utf8');
const dynamic=[...loaderSource.matchAll(/^    "[a-z0-9-]+": "(content\/[a-z0-9-]+\.js)"[, ]*$/gm)].map(m=>m[1]);
assert(dynamic.length>=40, `Only ${dynamic.length} declared on-demand entries`);cases++;
for(const file of dynamic){
 assert(fs.existsSync(path.join(root,file)),`${file} is missing`);cases++;
 assert(resources.has(file),`${file} is not web accessible`);cases++;
 assert(!eager.includes(file),`${file} is still eager`);cases++;
 assert(owned.has(file),`${file} is not assigned to a build bundle`);cases++;
}
assert.equal(manifest.version,'0.2.87');cases++;
assert(eager.includes('content/on-demand-modules.js'));cases++;
console.log('PASSED',cases,'assertions across lazy routes, Lite omissions, raw-text cache and compact name matching');
