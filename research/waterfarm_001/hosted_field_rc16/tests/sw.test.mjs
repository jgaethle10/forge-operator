import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const code=readFileSync(resolve(root,'sw.js'),'utf8');
function harness({failPrecache=false}={}){
  const handlers=new Map(), disks=new Map(),requests=[],deletions=[];
  const origin='https://aqua.evercraft.test';const scope=origin+'/aqua/';
  const caches={
    async open(name){
      if(!disks.has(name))disks.set(name,new Map());
      return {
        async addAll(urls){
          if(failPrecache)throw Error('network asset unavailable');
          for(const url of urls)disks.get(name).set(url,'cached:'+new URL(url).pathname);
        },
        async match(req){return disks.get(name).has(typeof req==='string'?req:req.url)?new Response(disks.get(name).get(typeof req==='string'?req:req.url)):undefined;}
      };
    },
    async keys(){return [...disks.keys()]},
    async delete(key){deletions.push(key);return disks.delete(key)}
  };
  const self={location:{origin},registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn),skipWaiting:()=>{throw Error('unsafe takeover')},clients:{claim:()=>{throw Error('unsafe claim')}}};
  const ctx={self,caches,URL,Response,Promise,fetch:async req=>{requests.push(req.url);return new Response('fresh');},Set};
  vm.runInNewContext(code,ctx);
  async function event(name,props={}){
    let work;const e={...props,waitUntil(p){work=p},respondWith(p){work=p}};
    handlers.get(name)(e);return work?await work:undefined;
  }
  return {handlers,disks,requests,deletions,event,scope};
}
test('install caches exact shell and does not take over live sessions',async()=>{
 const h=harness();await h.event('install');const values=[...h.disks.values()][0];
 assert.equal(values.size,12);assert.ok(values.has(h.scope+'app/readiness.mjs'));
 await h.event('activate');assert.equal(h.deletions.length,0);
});
test('failed precache refuses install, older cache remains intact',async()=>{
 const h=harness({failPrecache:true});h.disks.set('evercraft-aqua-field-rc15-static-v1',new Map([['old','working']]));
 await assert.rejects(h.event('install'),/asset unavailable/);
 assert.equal(h.disks.get('evercraft-aqua-field-rc15-static-v1').get('old'),'working');
});
test('successful activation removes old Aqua field caches, not other projects',async()=>{
 const h=harness();h.disks.set('evercraft-aqua-field-rc15-static-v1',new Map());h.disks.set('evercraft-payments-static',new Map());
 await h.event('install');await h.event('activate');
 assert.equal(h.disks.has('evercraft-aqua-field-rc15-static-v1'),false);
 assert.equal(h.disks.has('evercraft-payments-static'),true);
});
test('same-scope listed static GET served from precache',async()=>{
 const h=harness();await h.event('install');
 const result=await h.event('fetch',{request:{method:'GET',url:h.scope+'app/core.mjs'}});
 assert.match(await result.text(),/cached/);assert.equal(h.requests.length,0);
});
test('unknown same-origin endpoint, neighboring apps and cross-origin are NEVER intercepted',async()=>{
 const h=harness();await h.event('install');
 for(const url of [h.scope+'private/backup.json',h.scope+'api/readings','https://aqua.evercraft.test/payments/index.html','https://unrelated.example/data']){
  assert.equal(await h.event('fetch',{request:{method:'GET',url}}),undefined);
 }
 assert.equal(h.requests.length,0);
});
test('query-string cache aliasing disallowed',async()=>{
 const h=harness();await h.event('install');
 assert.equal(await h.event('fetch',{request:{method:'GET',url:h.scope+'app/core.mjs?preview=1'}}),undefined);
});
test('non-GET is not intercepted, even within app path',async()=>{
 const h=harness();await h.event('install');
 assert.equal(await h.event('fetch',{request:{method:'POST',url:h.scope+'index.html'}}),undefined);
});
test('cache failure returns 503 rather than potentially wrong build',async()=>{
 const h=harness();await h.event('install');
 const key=[...h.disks.keys()][0];h.disks.delete(key);
 // Offline fetch also fails.
 // For this harness fetch() succeeds, so it falls back to first-party network only.
 const result=await h.event('fetch',{request:{method:'GET',url:h.scope+'app/core.mjs'}});
 assert.equal(await result.text(),'fresh');assert.deepEqual(h.requests,[h.scope+'app/core.mjs']);
});
