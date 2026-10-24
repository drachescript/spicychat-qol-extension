'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../content/lorebook-backup.js'),'utf8');
const part=(a,b)=>{const x=src.indexOf(a),y=src.indexOf(b,x+a.length);assert(x>=0 && y>x);return src.slice(x,y);};
let count=0,active=null,fieldInput,clicked=[];
class Input {
  get value(){return this._value || '';} set value(v){this._value=v;}
  get placeholder(){return 'Add Tags';}
  getAttribute(){return null;}
  focus(){active=this;}
  click(){}
  dispatchEvent(){return true;}
  get isConnected(){return true;}
}
const tagRoot={
  querySelectorAll(selector){
    if(selector==='input')return [fieldInput];
    if(selector==='p,span,small')return [{textContent:`${count}/12`}];
    return [];
  }
};
const option=tag=>({
  disabled:false,isConnected:true,
  getAttribute(k){if(k==='aria-label')return tag;return null;},
  getClientRects(){return [1];},closest(){return null;},querySelector(){return null;},
  click(){clicked.push(tag);count++;fieldInput=new Input();}
});
const opts=[option('Character'),option('History')];
const doc={
  get activeElement(){return active;},
  querySelector(selector){if(selector==='[data-field-name="tags"]')return tagRoot;return null;},
  querySelectorAll(selector){
    if(selector.includes('button[value],button[aria-label]'))return opts;
    return [];
  }
};
fieldInput=new Input();
const ctx=vm.createContext({
  document:doc,HTMLInputElement:Input,HTMLTextAreaElement:Input,
  Event:class{constructor(type){this.type=type;}},
  PANEL_ID:'qol-backup',CLONE_PANEL_ID:'qol-clone',MERGE_PANEL_ID:'qol-merge',
  clean:(text,max=100)=>String(text||'').trim().slice(0,max),
  fieldContainerByLabel:()=>null,
  selectedChipTexts:()=>[],
  DS:{},setTimeout,Date,Promise,Error,Array
});
vm.runInContext('let cloneTagBusy=false;'+part('  function nativeTagField() {','  function nativeCoverStage('),ctx);
(async()=>{
  assert.equal(vm.runInContext('nativeTagOption("Character", nativeTagField().input)',ctx),null,'unfocused input may not select a tag');
  const result=await vm.runInContext('applyNativeLorebookTags(["Character","History"])',ctx);
  assert.deepEqual([...result.added],['Character','History']);
  assert.equal(result.missing.length,0);
  assert.equal(count,2);
  assert.deepEqual(clicked,['Character','History']);
  // No accidentally clickable duplicate tag names.
  count=0; clicked=[];fieldInput=new Input();active=fieldInput;
  opts.push(option('Character'));
  assert.equal(vm.runInContext('nativeTagOption("Character", nativeTagField().input)',ctx),null);
  console.log('PASS: Lorebook tag picker accepts unique native aria-label options, refetches React-remounted inputs and refuses ambiguous matches');
})().catch(e=>{console.error(e);process.exitCode=1});
