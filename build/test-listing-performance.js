'use strict';
// Minimal mutation-count regressions for My Creations/Lorebook filter hotpaths.
// Intentionally uses no browser API, npm dependencies or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function section(file, start, end) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Cannot locate ${start} in ${file}`);
  return src.slice(a, b);
}
function context(code, vars = {}) {
  const scope = vm.createContext({ ...vars });
  vm.runInContext(code, scope);
  return scope;
}
function fakeCard(id, index, lorebook = false) {
  let writes = 0;
  const classes = new Set();
  const dataset = { dsLorebookOriginalIndex: String(index) };
  const style = { _order:'', get order() { return this._order; }, set order(x) { this._order=x; writes++; }, removeProperty(k) { if (k==='order') { this._order='';writes++; } } };
  return { id, dataset, style, get writes() { return writes; }, classList: {
    contains: k=> classes.has(k), add:k=>{writes++;classes.add(k);},remove:k=>{writes++;classes.delete(k);},toggle:(k,on)=>{writes++; if(on)classes.add(k);else classes.delete(k);}
  }, parentElement:null };
}
function fakeParent(cards) {
  let moves=0; const parent={children:cards, appendChild(card) { this.children=this.children.filter(el=>el!==card);this.children.push(card);moves++; }};
  cards.forEach(card=>card.parentElement=parent);
  Object.defineProperty(parent,'moves',{get:()=>moves});
  return parent;
}
const lorebookCode = section('content/lorebook-filter.js', '  // Reparenting a card', '  function findToolbarPlacement');
const scope = context(lorebookCode, {DS:{state:{settings:{lorebookUnknownSafeFilter:false}},cardLorebookState:card=>card.lorebook?'has':'unknown'}});
const a=fakeCard('a',0,false), b=fakeCard('b',1,true), c=fakeCard('c',2,false);
const parent=fakeParent([a,b,c]);
const entries=[a,b,c].map(card=>({target:card,parent,card,lorebook:card===b}));
scope.sortEntries(entries,'lorebook-first');
assert.deepEqual(parent.children.map(x=>x.id),['b','a','c']);
const moved=parent.moves;
scope.sortEntries(entries,'lorebook-first');
assert.equal(parent.moves,moved,'repeat sort must not move DOM nodes');
scope.applyFilter(entries,'has');
const afterFilter=[a.writes,b.writes,c.writes];
scope.applyFilter(entries,'has');
assert.deepEqual([a.writes,b.writes,c.writes],afterFilter,'repeat filter must not rewrite card attributes');
scope.sortEntries(entries,'default');
assert.deepEqual(parent.children.map(x=>x.id),['a','b','c']);
const restored=parent.moves;
scope.sortEntries(entries,'default');
assert.equal(parent.moves,restored,'repeat default sort must not move DOM nodes');
scope.applyFilter(entries,'all');
assert(!a.classList.contains('ds-lorebook-filter-hidden'),'default view restores hidden class');
const createCode=section('content/my-creations-filters.js','  function compareNullableNumber','  function basicLoadedEntries');
const mine=context(createCode);
const cards=[fakeCard('z',0),fakeCard('a',1),fakeCard('b',2)];
const list=cards.map((target,index)=>({target,nativeIndex:index,meta:{name:target.id}}));
mine.applyOrder(list,'name');
const sortedWrites=cards.map(card=>card.writes);
mine.applyOrder(list,'name');
assert.deepEqual(cards.map(card=>card.writes),sortedWrites,'repeat CSS sort must not rewrite style.order');
mine.applyOrder(list,'native');
const nativeWrites=cards.map(card=>card.writes);
mine.applyOrder(list,'native');
assert.deepEqual(cards.map(card=>card.writes),nativeWrites,'repeat native sort must not rewrite styles');
const workflow=fs.readFileSync(path.join(root,'content/lorebook-workflow.js'),'utf8');
assert(workflow.includes('focused.closest("form")?.querySelector("textarea[name=\'content\']")'), 'Lorebook manager must defer row rescans while editing');
const tags=fs.readFileSync(path.join(root,'content/lorebook-tags.js'),'utf8');
assert(tags.includes('editorExpansionRunning = true') && tags.includes('editorExpansionPending = true'), 'keyword expander must serialize work');
assert(tags.includes('editorLastTypingAt') && tags.includes('containsCollapsedCounter(node)'), 'keyword observer must defer typing and avoid whole-subtree text reads');
console.log('PASS: repeated Lorebook sorting/filtering and My Creations CSS sorting are mutation-free; Lorebook expansion scheduling guards present.');
