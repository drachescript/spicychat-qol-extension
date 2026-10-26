'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(value) { this.set.add(value); }
  remove(value) { this.set.delete(value); }
  toggle(value, force) { if (force === undefined ? !this.set.has(value) : force) this.add(value); else this.remove(value); }
}
class FakeElement {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.dataset = {}; this.classList = new FakeClassList(); this.isConnected = false; this.parentElement = null; this.events = {}; this.disabled = false; this.id = ''; this.textContent = ''; }
  setAttribute(k,v) { this[k] = String(v); }
  append(child) { this.children.push(child); child.parentElement = this; child.isConnected = this.isConnected; }
  remove() { this.isConnected = false; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(x => x !== this); }
  addEventListener(event, callback) { this.events[event] = callback; }
  querySelector() { return null; }
  querySelectorAll(selector) { return selector?.includes('ds-context-keep-button') ? this.children.filter(x => x.className === 'ds-context-keep-button') : []; }
}
async function fixture({fail = false, undoFailure = false, onSend = null} = {}) {
  let store = {};
  let status = '';
  let warningCount = 0;
  let route = 'conversation:00000000-0000-0000-0000-000000000001';
  const body = new FakeElement('body'); body.isConnected = true;
  const root = new FakeElement('div'); root.id = 'message-test'; root.message = 'This message establishes a stable fact about the world.'; root.isConnected = true;
  const document = {
    body,
    documentElement: body,
    createElement: tag => new FakeElement(tag),
    getElementById: id => body.children.find(e => e.id === id && e.isConnected) || null,
    querySelectorAll: () => [],
    hidden: false,
    contains: el => el.isConnected
  };
  const DS = {
    state: {settings:{enabled:true,enableContextKeeper:true,contextKeeperMessageButtons:true}},
    isSingleChatPage: () => true,
    getCurrentChatScope: () => ({key:route}),
    getCachedMessageText: target => target.message,
    storageGet: async () => ({contextKeeperData:store}),
    recordLocalChange: async () => { if (undoFailure) throw new Error('Undo unavailable'); },
    runtimeLog: () => { warningCount++; },
    setQuickStatus: message => { status = message; },
  };
  const chrome = {
    runtime: {lastError:null, sendMessage: (message, callback) => {
      assert.equal(message.type, 'DS_CONTEXT_KEEPER_MUTATE');
      if(onSend) onSend(message);
      if(fail) {callback({ok:false,error:'Conflicting save'}); return;}
      const patch = message.patches[0];
      store = {...store,[patch.chatId]: patch.value};
      callback({ok:true,before:{},after:store});
    }},
    storage: {onChanged:{addListener(){}, removeListener(){}}}
  };
  const window = {
    DragonScriptQoL:DS,
    setTimeout: () => 1,
    addEventListener() {}, removeEventListener() {},
  };
  const context={window,document,chrome,location:{pathname:'/chat/test'},Element:FakeElement, setTimeout:() => 1,clearTimeout(){},setInterval(){},clearInterval(){},console};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../content/context-keeper.js'),'utf8'),context, {filename:'context-keeper.js'});
  assert.equal(DS.ensureContextKeeperMessageButtonForRoot(root),true);
  const button = root.children.find(x => x.className === 'ds-context-keep-button');
  assert(button);
  const click = () => button.events.click({preventDefault(){},stopPropagation(){}});
  return {root, button, click, body, DS, getStatus:()=>status, getWarnings:()=>warningCount, getData:()=>store, changeRoute:next=>route=next};
}
async function run(){
  const f=await fixture();
  await f.click();
  assert.equal(f.button.textContent,'Kept ✓');
  assert.equal(f.getData()['conversation:00000000-0000-0000-0000-000000000001'].details.length,1);
  assert.match(f.getStatus(),/Message saved to Context Keeper/);
  f.button.remove(); // Native React toolbar is replaced while feedback remains.
  assert(f.body.children.some(e=>e.id==='ds-context-keep-notice' && e.isConnected));
  await f.click();
  assert.equal(f.button.textContent,'Already kept');
  assert.equal(f.getData()['conversation:00000000-0000-0000-0000-000000000001'].details.length,1);
  const fail=await fixture({fail:true});
  await fail.click();
  assert.equal(fail.button.textContent,'Not saved');
  assert.match(fail.getStatus(),/couldn't confirm/);
  assert.equal(Object.keys(fail.getData()).length,0);
  const undo=await fixture({undoFailure:true});
  await undo.click();
  assert.equal(undo.button.textContent,'Kept ✓');
  assert(undo.getWarnings()>=1);
  console.log('v0.2.62 Keep: confirmed save, duplicate, failed write, undo-error, and toolbar-remount feedback passed.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
