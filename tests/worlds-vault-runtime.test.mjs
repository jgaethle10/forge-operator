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
 // A plain static server accepted these nested index paths, but the owned vault
 // previously treated them as directories and incorrectly returned 404.
 const heritage=await fetch(base+'/worlds/heritage/');
 assert.equal(heritage.status,200,'owned vault must serve the heritage walkthrough');
 assert.match(await heritage.text(),/EDUCATIONAL SCHEMATIC/);
 assert.match(heritage.headers.get('content-type')||'',/text\/html/);
 const app=await fetch(base+'/worlds/heritage/app.mjs');
 assert.equal(app.status,200);
 assert.match(app.headers.get('content-type')||'',/text\/javascript/);
 assert.match(await app.text(),/buildHeritageDrawList/);
 const scene=await fetch(base+'/worlds/heritage/scene.mjs');
 assert.equal(scene.status,200);
 assert.match(await scene.text(),/pavlopetri-learning-scene-v1/);
 // The external edge leases only /worlds/. Reuse one canonical atlas data
 // source through an exact two-file same-origin alias, not a second source copy.
 const atlas=await fetch(base+'/worlds/heritage/atlas/');
 assert.equal(atlas.status,200,'same-origin atlas route missing');
 assert.match(await atlas.text(),/SUBMERGED HERITAGE ATLAS/);
 const sites=await fetch(base+'/worlds/heritage/atlas/sites.geojson');
 assert.equal(sites.status,200);
 assert.match(sites.headers.get('content-type')||'',/application\/geo\+json/);
 const data=await sites.json();
 assert.equal(data.type,'FeatureCollection');
 assert.equal(data.features.length,7);
 assert.equal((await fetch(base+'/worlds/heritage/atlas/nonexistent.json')).status,404);
 assert.equal((await fetch(base+'/submerged-heritage/')).status,404,'vault must not expose unrelated static directories');

 // Hidden World uses the same owned /worlds/ asset boundary, not a second host.
 const hiddenIndex=await fetch(base+'/worlds/hidden-world/');
 assert.equal(hiddenIndex.status,200,'Hidden World directory index should resolve');
 assert.match(await hiddenIndex.text(),/Hidden World Atlas/);
 const hiddenExhibit=await fetch(base+'/worlds/hidden-world/yakima-standalone.html');
 assert.equal(hiddenExhibit.status,200);
 assert.match(await hiddenExhibit.text(),/scene-ready/);
 const hiddenEvidence=await fetch(base+'/worlds/hidden-world/yakima-evidence.html');
 assert.equal(hiddenEvidence.status,200);
 assert.match(await hiddenEvidence.text(),/Connected tunnels established by the records reviewed/);
 const lund=await fetch(base+'/worlds/hidden-world/lund-building.html');
 assert.equal(lund.status,200,'Lund exhibit route should resolve from owned vault');
 assert.match(lund.headers.get('content-type')||'',/^text\/html/);
 assert.match(await lund.text(),/National Register nomination PDF/);
 const titan=await fetch(base+'/worlds/hidden-world/titan-i-1962.html');
 assert.equal(titan.status,200);
 assert.match(titan.headers.get('content-type')||'',/^text\/html/);
 assert.match(await titan.text(),/Original educational SVG/);
 const titanEvidence=await fetch(base+'/worlds/hidden-world/titan-i-1962-evidence.v1.json');
 assert.equal(titanEvidence.status,200);
 assert.match(titanEvidence.headers.get('content-type')||'',/^application\/json/);
 const titanData=await titanEvidence.json();
 assert.equal(titanData.schema,'evercraft.hidden-world.cold-war-evidence.v1');
 assert.equal(titanData.broad_regions.every(x=>x.actual_complex_coordinates===null&&x.open_to_public===false),true);


 const hiddenCsv=await fetch(base+'/worlds/hidden-world/hidden_world_atlas_v1.csv');
 assert.equal(hiddenCsv.status,200);
 assert.match(hiddenCsv.headers.get('content-type')||'',/^text\/csv/);
 assert.match(await hiddenCsv.text(),/yakima,/);
 const hiddenLedger=await fetch(base+'/worlds/hidden-world/yakima-evidence-ledger.v1.json');
 assert.equal(hiddenLedger.status,200);
 assert.match(hiddenLedger.headers.get('content-type')||'',/^application\/json/);
 const ledger=await hiddenLedger.json();
 assert.equal(ledger.schema,'evercraft.hidden-world.evidence-ledger.v1');
 assert.equal(ledger.records.length,7);
 assert.equal(ledger.records.every(r=>r.geometry_verified===false&&r.connected_tunnel_verified===false&&r.recorded_coordinates===null),true);
 assert.equal((await fetch(base+'/worlds/hidden-world/.git/')).status,404);


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
