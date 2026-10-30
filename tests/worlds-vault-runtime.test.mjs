import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startWorldsVault,VAULT_SCHEMA} from '../systemia/worlds/worlds-vault-runtime.mjs';
import {initialWorld,applyCommand} from '../public/worlds/world-core.mjs';
import {encodeSharedScene,decodeSharedScene} from '../public/worlds/share-scene.mjs';

const publicRoot=path.resolve('public');
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'evercraft-worlds-vault-'));
 const dataRoot=path.join(root,'private');
 const service=await startWorldsVault({dataRoot,publicRoot});
 t.after(async()=>{await service.close();await fs.rm(root,{recursive:true,force:true});});
 return {service,dataRoot};
}
const make=()=>{let s=initialWorld();s=applyCommand(s,'add tree').world;return encodeSharedScene(s);};
const request=(url,method='GET',body,headers={})=>fetch(url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});

test('worlds vault persists scenes, separates private edit capability, survives process restart',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'evercraft-worlds-restart-'));
 t.after(async()=>fs.rm(root,{recursive:true,force:true}));
 const options={dataRoot:path.join(root,'private'),publicRoot};
 const first=await startWorldsVault(options);
 const health=await (await fetch(first.url+'/worlds/api/health')).json();
 assert.equal(health.schema,VAULT_SCHEMA);
 assert.equal(health.ok,true);
 const create=await request(first.url+'/worlds/api/worlds','POST',{scene_token:make()});
 assert.equal(create.status,201);
 const created=await create.json();
 assert.match(created.world_id,/^[a-f0-9]{32}$/);
 assert.match(created.edit_token,/^[a-f0-9]{64}$/);
 const saved=await (await fetch(first.url+'/worlds/api/worlds/'+created.world_id)).json();
 assert.equal(saved.version,1);
 assert.equal(saved.scene_token,make());
 assert.equal('edit_token' in saved,false);
 const denied=await request(first.url+'/worlds/api/worlds/'+created.world_id,'PUT',{scene_token:make()});
 assert.equal(denied.status,401);
 const badToken=await request(first.url+'/worlds/api/worlds/'+created.world_id,'PUT',{scene_token:make()},
  {'Authorization':'Bearer '+'c'.repeat(64),'If-Match':'"1"'});
 assert.equal(badToken.status,403);
 let w=initialWorld();w=applyCommand(w,'add bench').world;
 const update=await request(first.url+'/worlds/api/worlds/'+created.world_id,'PUT',{scene_token:encodeSharedScene(w)},
 {'Authorization':'Bearer '+created.edit_token,'If-Match':'"1"'});
 assert.equal(update.status,200);
 assert.equal((await update.json()).version,2);
 const conflict=await request(first.url+'/worlds/api/worlds/'+created.world_id,'PUT',{scene_token:make()},
 {'Authorization':'Bearer '+created.edit_token,'If-Match':'"1"'});
 assert.equal(conflict.status,409);
 await first.close();
 const second=await startWorldsVault(options);
 t.after(()=>second.close());
 const read=await (await fetch(second.url+'/worlds/api/worlds/'+created.world_id)).json();
 assert.equal(read.version,2);
 assert.equal(decodeSharedScene(read.scene_token).objects[0].kind,'bench');
 const stat=await fs.stat(path.join(options.dataRoot,created.world_id+'.json'));
 assert.equal(stat.mode&0o777,0o600);
});
test('vault serves Worlds UI, keeps data private and rejects malformed writes and cross-origin requests',async t=>{
 const {service,dataRoot}=await fixture(t),base=service.url;
 const ui=await fetch(base+'/worlds/');
 assert.equal(ui.status,200);
 assert.match(await ui.text(),/EVERCRAFT/);
 const health=await fetch(base+'/worlds/api/health');
 assert.equal(health.headers.get('access-control-allow-origin'),null);
 assert.equal((await request(base+'/worlds/api/worlds','POST',{scene_token:'garbage'})).status,422);
 assert.equal((await request(base+'/worlds/api/worlds','POST',{})).status,400);
 assert.equal((await request(base+'/worlds/api/worlds','POST',{scene_token:make()},
 {'Origin':'https://attacker.invalid'})).status,403);
 assert.equal((await request(base+'/worlds/api/worlds','POST',{scene_token:make()},
 {'Content-Type':'text/plain'})).status,415);
 assert.equal((await request(base+'/worlds/api/worlds','POST',{scene_token:'a'.repeat(13000)})).status,413);
 assert.equal((await fetch(base+'/worlds/../.env')).status,404);
 assert.equal((await fetch(base+'/worlds/api/worlds/'+'f'.repeat(32))).status,404);
 assert.equal((await fetch(base+'/worlds/api/worlds/foo')).status,404);
 assert.equal((await fetch(base+'/worlds/world-core.mjs')).status,200);
 const records=await fs.readdir(dataRoot);
 assert.equal(records.filter(name=>name.endsWith('.json')).length,0);
});
test('vault refuses public data directory and enforces file capacity',async t=>{
 await assert.rejects(()=>startWorldsVault({dataRoot:path.join(publicRoot,'worlds'),publicRoot}),/outside_public/);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'evercraft-worlds-cap-'));
 t.after(async()=>fs.rm(root,{recursive:true,force:true}));
 const service=await startWorldsVault({publicRoot,dataRoot:path.join(root,'data'),maxWorlds:1});
 t.after(()=>service.close());
 assert.equal((await request(service.url+'/worlds/api/worlds','POST',{scene_token:make()})).status,201);
 assert.equal((await request(service.url+'/worlds/api/worlds','POST',{scene_token:make()})).status,507);
});
