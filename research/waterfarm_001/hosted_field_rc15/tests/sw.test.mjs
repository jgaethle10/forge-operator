import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const code=readFileSync(resolve(root,'sw.js'),'utf8');
function harness(){
 const handlers=new Map(),staticFiles=new Set(),calls=[],cacheStores=new Map();
 let claim=0,skip=0;
 const mkcache=key=>({async addAll(paths){for(const path of paths)staticFiles.add(path);}, async match(req){return staticFiles.has(req.url)?new Response('cached'):undefined;}});
 const caches={async open(name){cacheStores.set(name,mkcache(name));return cacheStores.get(name);},async keys(){return [...cacheStores.keys()];},async delete(k){return cacheStores.delete(k);},async match(req){const path=req.url.replace('https://aqua.evercraft.test/','./');return staticFiles.has(path)?new Response('cached'):undefined;}};
 const self={location:{origin:'https://aqua.evercraft.test'},addEventListener:(k,h)=>handlers.set(k,h),skipWaiting:()=>{skip++;},clients:{claim:()=>{claim++;}}};
 const ctx={self,caches,URL,Response,fetch:async(req)=>{calls.push(req.url);return new Response('fresh');},Promise};
 vm.runInNewContext(code,ctx);
 return {handlers,cacheStores,calls,staticFiles,stats:()=>({claim,skip})};
}
async function runEvent(handler,props={}){let work;const event={...props,waitUntil:p=>{work=p},respondWith:p=>{work=p}};handler(event);return await work;}
test('register install/activate/fetch handlers, versioned cache',async()=>{
 const h=harness();assert.deepEqual([...h.handlers.keys()],['install','activate','fetch']);
 await runEvent(h.handlers.get('install'));assert.equal(h.stats().skip,1);assert.ok(h.staticFiles.has('./app/storage.mjs'));
 await runEvent(h.handlers.get('activate'));assert.equal(h.stats().claim,1);
});
test('cross-origin HTTP requests are not intercepted',async()=>{
 const h=harness();let handled=false;h.handlers.get('fetch')({request:{method:'GET',url:'https://unrelated.example/tracker'},respondWith:()=>{handled=true}});assert.equal(handled,false);
});
test('POST requests are not intercepted',async()=>{
 const h=harness();let handled=false;h.handlers.get('fetch')({request:{method:'POST',url:'https://aqua.evercraft.test/upload'},respondWith:()=>{handled=true}});assert.equal(handled,false);
});
test('same-origin assets can return from installed offline static cache',async()=>{
 const h=harness();await runEvent(h.handlers.get('install'));
 const r=await runEvent(h.handlers.get('fetch'),{request:{method:'GET',url:'https://aqua.evercraft.test/app/storage.mjs'}});
 assert.equal(await r.text(),'cached');assert.equal(h.calls.length,0);
});
test('uncached same-origin GET uses first-party network only',async()=>{
 const h=harness();const r=await runEvent(h.handlers.get('fetch'),{request:{method:'GET',url:'https://aqua.evercraft.test/other.txt'}});
 assert.equal(await r.text(),'fresh');assert.deepEqual(h.calls,['https://aqua.evercraft.test/other.txt']);
});
