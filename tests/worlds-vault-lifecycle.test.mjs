import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startWorldsVault} from '../systemia/worlds/worlds-vault-runtime.mjs';
import {initialWorld,applyCommand} from '../public/worlds/world-core.mjs';
import {encodeSharedScene} from '../public/worlds/share-scene.mjs';
import {publishWorld,unpublishWorld,fetchPublishedWorld} from '../public/worlds/cloud-client.mjs';
const root=path.resolve('public');
const scene=()=>encodeSharedScene(applyCommand(initialWorld(),'plant flower at 4, 2').world);
async function setup(t,options={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'evercraft-worlds-lifecycle-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const s=await startWorldsVault({dataRoot:path.join(dir,'vault'),publicRoot:root,...options});
 t.after(()=>s.close());
 return {s,dir};
}
async function create(s){
 const response=await fetch(s.url+'/worlds/api/worlds',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scene_token:scene()})});
 return {response,data:await response.json()};
}
test('creator may unpublish an online world; view and edits stop immediately',async t=>{
 const {s,dir}=await setup(t);
 const original=await create(s);assert.equal(original.response.status,201);
 const {world_id:id,edit_token:token}=original.data;
 const url=s.url+'/worlds/api/worlds/'+id;
 assert.equal((await fetch(url)).status,200);
 const fail=await fetch(url,{method:'DELETE'});
 assert.equal(fail.status,401);
 const attacker=await fetch(url,{method:'DELETE',headers:{authorization:'Bearer '+'a'.repeat(64),'if-match':'"1"'}});
 assert.equal(attacker.status,403);
 const conflict=await fetch(url,{method:'DELETE',headers:{authorization:'Bearer '+token,'if-match':'"2"'}});
 assert.equal(conflict.status,409);
 const crossOrigin=await fetch(url,{method:'DELETE',headers:{authorization:'Bearer '+token,'if-match':'"1"',Origin:'https://attacker.invalid'}});
 assert.equal(crossOrigin.status,403);
 const success=await fetch(url,{method:'DELETE',headers:{authorization:'Bearer '+token,'if-match':'"1"'}});
 assert.equal(success.status,200);
 const ack=await success.json();
 assert.equal(ack.unpublished,true);assert.equal(ack.world_id,id);
 assert.equal((await fetch(url)).status,404);
 const stale=await fetch(url,{method:'PUT',headers:{authorization:'Bearer '+token,'if-match':'"1"','content-type':'application/json'},body:JSON.stringify({scene_token:scene()})});
 assert.equal(stale.status,404);
 const duplicate=await fetch(url,{method:'DELETE',headers:{authorization:'Bearer '+token,'if-match':'"1"'}});
 assert.equal(duplicate.status,404);
 const active=await fs.readdir(path.join(dir,'vault'));
 assert.equal(active.some(name=>name===id+'.json'),false);
});
test('create is serialized so parallel requests cannot exceed the capacity bound',async t=>{
 const {s}=await setup(t,{maxWorlds:1});
 const attempts=await Promise.all(Array.from({length:8},()=>create(s)));
 assert.equal(attempts.filter(x=>x.response.status===201).length,1);
 assert.equal(attempts.filter(x=>x.response.status===507).length,7);
});
test('public browser client unpublishes with creator capability only',async t=>{
 const {s}=await setup(t);
 const remote=(u,o)=>fetch(new URL(u,s.url),o);
 const w=initialWorld();
 const owner=await publishWorld(w,null,remote);
 assert.equal((await fetchPublishedWorld(owner.id,remote)).sky,'day');
 assert.equal(await unpublishWorld(owner,remote),true);
 await assert.rejects(()=>fetchPublishedWorld(owner.id,remote),/world_not_found/);
 await assert.rejects(()=>unpublishWorld(owner,remote),/world_not_found/);
 await assert.rejects(()=>unpublishWorld(null,remote),/capability is missing/);
});
