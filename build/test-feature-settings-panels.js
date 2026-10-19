/* Static DOM construction checks for feature-owned Settings panels.
   Run: node build/test-feature-settings-panels.js */
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const inventory = JSON.parse(fs.readFileSync(path.join(__dirname,'settings-panels-baseline.json'),'utf8'));
const html = fs.readFileSync(path.join(root,'options.html'),'utf8');
class Elem {
  constructor(tag,text){this.tag=tag;this.text=text;this.attrs={};this.children=[];}
  setAttribute(k,v){this.attrs[k]=v;}
  appendChild(n){this.children.push(n);return n;}
  replaceWith(n){this.replacement=n;}
}
function check(feature, data) {
  const sourcePath = `settings/feature-panels/${feature}.js`;
  const code = fs.readFileSync(path.join(root,sourcePath),'utf8');
  const slot = `ds-feature-panel-${feature}`;
  if (!html.includes(`id="${slot}"`) || !html.includes(`src="${sourcePath}"`)) {
    throw new Error(`${feature}: Settings slot or script registration missing`);
  }
  function run(features) {
    const slotElement = new Elem('div');
    const document = {
      getElementById:id => id===slot ? slotElement : null,
      createElement:tag => new Elem(tag),
      createTextNode:text => new Elem('#text',text),
    };
    vm.runInNewContext(code,{window:{__DSQ_BUILD_PROFILE__:{generated:true,features}},document},
      {filename:sourcePath,timeout:1000});
    return slotElement.replacement;
  }
  const built = run([feature]);
  if (!built || built.tag!=='section' || built.attrs.id!==data.cardId) {
    throw new Error(`${feature}: did not recreate the original section`);
  }
  const ids=[];
  const collect=n=>{if(n.attrs.id)ids.push(n.attrs.id);n.children.forEach(collect)};
  collect(built);
  if(JSON.stringify(ids.slice(1))!==JSON.stringify(data.ids)) {
    throw new Error(`${feature}: Settings controls no longer match the original IDs or ordering`);
  }
  if(run([])!==undefined)throw new Error(`${feature}: panel included for omitted feature`);
}
for(const [feature,data] of Object.entries(inventory))check(feature,data);
console.log(`PASS ${Object.keys(inventory).length} Settings-panel ownership cases`);
