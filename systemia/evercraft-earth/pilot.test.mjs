// node --test systemia/evercraft-earth/pilot.test.mjs
// Zero-dependency syntax and DOM-stub behavioral smoke tests for the static pilot.
// Not a substitute for browser, cartographic, accessibility or data-quality QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const html=readFileSync(resolve(root,'public/apps/evercraft-earth/index.html'),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const inline=scripts.map(x=>x[1]).filter(Boolean).at(-1);

function harness(){
 const nodes=new Map();
 function node(tag='div'){
  return {tag,className:'',textContent:'',value:'',children:[],handlers:{},dataset:{},
   addEventListener(name,cb){this.handlers[name]=cb;},
   querySelectorAll(){return[];},
   append(...args){this.children.push(...args);},
   replaceChildren(...args){this.children=[...args];},
   setAttribute(name,value){this[name]=value;},
   scrollIntoView(){},
   click(){if(this.handlers.click)this.handlers.click();}};
 }
 const get=id=>{
  if(!nodes.has(id))nodes.set(id,node());
  return nodes.get(id);
 };
 get('fromDate').value='2023-01-01';
 get('toDate').value='2026-10-23';
 get('place').value='yakima';
 const doc={getElementById:get,createElement:node};
 const context={document:doc,URL,Date,Number,Blob,console,setTimeout};
 vm.runInNewContext(inline,context,{timeout:2000,filename:'pilot-inline.js'});
 return {get,context};
}
test('static application has parseable JavaScript and production-truth labels',()=>{
 assert.ok(inline,'inline script present');
 assert.doesNotThrow(()=>new vm.Script(inline));
 for(const phrase of ['SYNTHETIC','NO VERIFIED DATA LOADED','not independently verified','Coverage unknown','Washington State DOH','US EPA']){
  assert.ok(html.includes(phrase),'missing: '+phrase);
 }
});
test('empty state does not suggest absence of contamination',()=>{
 const {get}=harness();
 assert.match(get('summary').textContent,/coverage gap/i);
 assert.equal(get('pointCount').textContent,'0');
});
test('synthetic demo creates a correctly labeled dated comparison',()=>{
 const {get}=harness();
 get('demo').click();
 assert.match(get('modeFlag').textContent,/SYNTHETIC/);
 assert.equal(get('pointCount').textContent,'1');
 assert.equal(get('pairCount').textContent,'1');
 assert.match(get('overlayMode').textContent,/SIMULATED/);
});
test('date ordering prevents misleading comparisons',()=>{
 const {get}=harness();
 get('demo').click();
 get('fromDate').value='2026-01-01';
 get('toDate').value='2023-01-01';
 get('fromDate').handlers.change();
 assert.match(get('summary').textContent,/earlier snapshot must not be later/i);
});
test('clearing observations removes all comparisons',()=>{
 const {get}=harness();
 get('demo').click();get('clear').click();
 assert.equal(get('pointCount').textContent,'0');
 assert.match(get('summary').textContent,/coverage gap/i);
});
test('all four layers are exposed',()=>{
 for(const topic of ['pfas','fire','land','infrastructure'])
  assert.ok(html.includes('data-topic="'+topic+'"'));
});
