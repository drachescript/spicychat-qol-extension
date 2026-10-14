'use strict';
// Read-only migration parity audit against the pre-bulk v47 source with OOC extraction.
// Usage: node build/test_v48_bulk_parity.js /path/to/pre-bulk-source
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const ROOT=path.join(__dirname,'..');
const BEFORE=path.resolve(process.argv[2]||'/mnt/data/qol48_stage1');
if(!fs.existsSync(path.join(BEFORE,'options.js')))throw new Error('Missing baseline source: '+BEFORE);
function source(p){return fs.readFileSync(p,'utf8')}
function parse(s,label){let ast=ts.createSourceFile(label,s,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);assert.equal(ast.parseDiagnostics.length,0,label+' syntax parse');return ast}
function decls(root,rel){let s=source(path.join(root,rel)),ast=parse(s,rel);return ast.statements.filter(ts.isFunctionDeclaration).map(n=>({name:n.name.text,code:s.slice(n.getStart(ast),n.end)}));}
function testCollection(sourceFile, dir){
 let old=decls(BEFORE,sourceFile);
 let paths=fs.readdirSync(path.join(ROOT,dir)).filter(n=>n.endsWith('.js')).sort();
 let found=[];for(let f of paths)found.push(...decls(ROOT,path.join(dir,f)));
 assert.equal(found.length,old.length,sourceFile+' function count');
 const expected=new Map(old.map(d=>[d.name,d.code]));
 let duplicates=old.map(d=>d.name).filter((x,i,a)=>a.indexOf(x)!==i);
 assert.deepEqual(duplicates,[],sourceFile+' duplicate declaration names');
 for(let d of found)assert.equal(d.code,expected.get(d.name),`Extracted ${d.name} changed`);
 assert.equal(new Set(found.map(d=>d.name)).size,old.length);
 assert.equal(decls(ROOT,sourceFile).length,0,'Shared controller still owns top-level feature functions');
 console.log('PASS '+sourceFile+': '+old.length+' exact function bodies across '+paths.length+' files');
}
testCollection('options.js','settings/features');
testCollection('background.js','background/features');
const orig=source(path.join(BEFORE,'background/background-events.js'));
const newController=source(path.join(ROOT,'background/background-events.js'));
let originalAst=parse(orig,'old events');
let moved=0;
for(let file of fs.readdirSync(path.join(ROOT,'background/events')).sort()){
 const contents=source(path.join(ROOT,'background/events',file));
 const ast=parse(contents,file), fn=ast.statements.find(ts.isFunctionDeclaration);
 assert.ok(fn,`No registration function in ${file}`);
 const originalCallback=contents.slice(fn.body.getStart(ast)+1,fn.body.end-1).trim();
 assert.ok(orig.includes(originalCallback),`Event handler changed in ${file}`);
 assert.ok(newController.includes(fn.name.text+'();'),`Event registration missing: ${file}`);
 moved++;
}
assert.equal(moved,12,'Event registration count');
console.log('PASS background events: '+moved+' identical event/initialization blocks');
const manifest=JSON.parse(source(path.join(ROOT,'manifest.json')));
const oldManifest=JSON.parse(source(path.join(BEFORE,'manifest.json')));
assert.deepEqual(manifest.content_scripts,oldManifest.content_scripts,'Full content manifest changed');
assert.equal(manifest.version,'0.2.47');
console.log('PASS Full manifest content script and CSS parity');
