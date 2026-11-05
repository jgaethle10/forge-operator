import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startPublicEdgeRuntime} from '../systemia/network/public-edge-runtime.mjs';
import {startWorldsVault} from '../systemia/worlds/worlds-vault-runtime.mjs';
import {inspectWorldsEdge,reconcileWorldsRoute,checkedLoopbackUrl,WORLDS_ROUTE_SCHEMA} from '../systemia/worlds/worlds-edge-route.mjs';
import {initialWorld} from '../public/worlds/world-core.mjs';
import {encodeSharedScene} from '../public/worlds/share-scene.mjs';

const ORIGIN='https://worlds.example.org';
const BINDING={deploymentReceiptHash:'a'.repeat(64),instanceId:'evercraft-worlds-fixture-001'};
async function setup(t,{origin=ORIGIN}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'worlds-edge-proof-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const edge=await startPublicEdgeRuntime({mode:'proof_loopback'});
 t.after(()=>edge.close());
 const vault=await startWorldsVault({publicRoot:path.resolve('public'),dataRoot:path.join(root,'private'),publicOrigin:origin});
 t.after(()=>vault.close());
 return {edge,vault,params:{edgeControlUrl:edge.controlUrl,vaultUrl:vault.url,publicOrigin:ORIGIN,allowProof:true,...BINDING}};
}
test('owned edge proof routes real Worlds API, preserves path, origin and write restrictions',async t=>{
 const {edge,params}=await setup(t);
 await assert.rejects(()=>inspectWorldsEdge({...params,allowProof:false}),/proof_only/);
 const inspected=await inspectWorldsEdge(params);
 assert.equal(inspected.ready,true);
 assert.equal(inspected.proof_only,true);
 assert.equal(edge.health().active_routes,0,'read-only admission must not mutate route registry');
 const receipt=await reconcileWorldsRoute(params);
 assert.equal(receipt.schema,WORLDS_ROUTE_SCHEMA);
 assert.equal(receipt.proof_only,true);
 assert.equal(receipt.action,'created');
 assert.equal(receipt.external_https_verified,false);
 assert.equal(edge.health().active_routes,1);
 const route=receipt.lease_origin;
 const health=await (await fetch(route+'/worlds/api/health')).json();
 assert.equal(health.schema,'evercraft.worlds.vault.v1');
 assert.equal(health.public_origin,ORIGIN);
 const scene=encodeSharedScene(initialWorld());
 const post=async origin=>fetch(route+'/worlds/api/worlds',{
  method:'POST',headers:{'content-type':'application/json',origin},
  body:JSON.stringify({scene_token:scene})
 });
 const good=await post(ORIGIN);assert.equal(good.status,201);
 const created=await good.json();
 const read=await (await fetch(route+'/worlds/api/worlds/'+created.world_id)).json();
 assert.equal(read.scene_token,scene);
 assert.equal((await post('https://attacker.example.org')).status,403);
 const rewrite=await fetch(route+'/worlds/');
 assert.equal(rewrite.status,200);
 assert.match(await rewrite.text(),/EVERCRAFT/);
 const renewed=await reconcileWorldsRoute({...params,previousLease:receipt});
 assert.equal(renewed.action,'renewed');
 assert.equal(renewed.lease_id,receipt.lease_id);
 assert.equal(edge.health().active_routes,1);
 await edge.releaseRouteLease(receipt.lease_id,'integration-test');
 const replaced=await reconcileWorldsRoute({...params,previousLease:renewed});
 assert.equal(replaced.action,'created');
 assert.notEqual(replaced.lease_id,receipt.lease_id);
 assert.equal(edge.health().active_routes,1);
});
test('edge cannot bind Worlds to mismatched origin or mutable untrusted prior lease',async t=>{
 const {params}=await setup(t,{origin:'https://other.example.org'});
 await assert.rejects(()=>inspectWorldsEdge(params),/vault_public_origin_mismatch/);
 await assert.rejects(()=>reconcileWorldsRoute(params),/vault_public_origin_mismatch/);
 const corrected={...params,publicOrigin:'https://other.example.org'};
 const receipt=await reconcileWorldsRoute(corrected);
 await assert.rejects(()=>reconcileWorldsRoute({...corrected,previousLease:{...receipt,vault_url:'http://127.0.0.1:9999'}}),/previous_lease_binding_mismatch/);
});
test('host validation, external false claims and receipt requirements are fail closed',async t=>{
 for(const url of ['http://8.8.8.8:7777','https://127.0.0.1:9999','http://localhost:7777','http://127.0.0.1:7777/path','http://u:p@127.0.0.1:7777']){
  assert.throws(()=>checkedLoopbackUrl(url),/loopback/);
 }
 assert.equal(checkedLoopbackUrl('http://127.0.0.1:8788'),'http://127.0.0.1:8788');
 const {params}=await setup(t);
 await assert.rejects(()=>reconcileWorldsRoute({...params,deploymentReceiptHash:'random'}),/deployment_receipt_required/);
 await assert.rejects(()=>reconcileWorldsRoute({...params,instanceId:'x'}),/deployment_instance_required/);
});
test('worlds route is re-established after edge controller restart using the same deployment binding',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'worlds-restart-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const vault=await startWorldsVault({dataRoot:path.join(root,'private'),publicRoot:path.resolve('public'),publicOrigin:ORIGIN});
 t.after(()=>vault.close());
 const first=await startPublicEdgeRuntime({mode:'proof_loopback'});
 const params={edgeControlUrl:first.controlUrl,vaultUrl:vault.url,publicOrigin:ORIGIN,allowProof:true,...BINDING};
 const receipt=await reconcileWorldsRoute(params);
 await first.close();
 const second=await startPublicEdgeRuntime({mode:'proof_loopback'});
 t.after(()=>second.close());
 const next=await reconcileWorldsRoute({...params,edgeControlUrl:second.controlUrl,previousLease:receipt});
 assert.equal(next.action,'created');
 assert.notEqual(next.edge_instance_id,receipt.edge_instance_id);
 assert.equal(second.health().active_routes,1);
});
