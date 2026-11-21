import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const registry=JSON.parse(fs.readFileSync(path.join(root,'public/worlds/destinations.v1.json'),'utf8'));
const gateway=fs.readFileSync(path.join(root,'public/worlds/gateway/index.html'),'utf8');
const safeRoute=p=>/^\/worlds\/(?:[a-z0-9/-]*)(?:#[a-z0-9-]+)?$/.test(p)&&!p.includes('//')&&!p.includes('..');
test('Worlds destinations have unique internal owned routes',()=>{
 assert.equal(registry.schema,'evercraft.worlds.destinations.v1');
 assert.equal(registry.version,1);
 assert.ok(registry.destinations.length>=6);
 const ids=new Set(),routes=new Set();
 for(const d of registry.destinations){
  assert.match(d.id,/^[a-z0-9-]+$/);
  assert.ok(!ids.has(d.id));ids.add(d.id);
  assert.ok(safeRoute(d.path),d.path);
  assert.ok(!routes.has(d.path));routes.add(d.path);
  assert.ok(Array.isArray(d.capabilities)&&d.capabilities.length>0);
  assert.equal(d.worldState==='isolated'||d.worldState==='local_browser',true);
  const local=d.path.replace(/^\/worlds\//,'').split('#')[0];
  assert.ok(fs.existsSync(path.join(root,'public/worlds',local,'index.html')),d.path);
 }
 assert.ok(ids.has(registry.home));
 assert.equal(registry.gateway,'/worlds/gateway/');
});
test('Gateway exposes every registered destination and does not promise false integration',()=>{
 for(const d of registry.destinations){
  const relative=d.path.replace('/worlds/','../');
  assert.ok(gateway.includes('href="'+relative+'"'),d.id);
 }
 for(const key of ['sharedWorldSimulation','seamlessTravel','multiplayer','sharedPlayerProgress','personalDataTransferred']){
  assert.equal(registry.integration[key],false,key);
 }
});
