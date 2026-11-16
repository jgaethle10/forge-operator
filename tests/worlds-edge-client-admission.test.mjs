import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startPublicEdgeRuntime} from '../systemia/network/public-edge-runtime.mjs';
import {startWorldsVault} from '../systemia/worlds/worlds-vault-runtime.mjs';
import {reconcileWorldsRoute} from '../systemia/worlds/worlds-edge-route.mjs';
import {initialWorld} from '../public/worlds/world-core.mjs';
import {encodeSharedScene} from '../public/worlds/share-scene.mjs';

test('a remote visitor cannot bypass the Worlds quota with a forged forwarded address',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'evercraft-worlds-client-edge-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const edge=await startPublicEdgeRuntime({mode:'proof_loopback'});
 t.after(()=>edge.close());
 const origin='https://worlds.example.org';
 const vault=await startWorldsVault({dataRoot:path.join(root,'private'),publicRoot:path.resolve('public'),publicOrigin:origin});
 t.after(()=>vault.close());
 const lease=await reconcileWorldsRoute({edgeControlUrl:edge.controlUrl,vaultUrl:vault.url,
  publicOrigin:origin,allowProof:true,deploymentReceiptHash:'e'.repeat(64),
  instanceId:'worlds-canonical-client-test'});
 const post=async spoof=>fetch(lease.lease_origin+'/worlds/api/worlds',{
  method:'POST',
  headers:{origin,'content-type':'application/json',
   'x-worlds-client-ip':spoof,'x-forwarded-for':'198.51.100.200'},
  body:JSON.stringify({scene_token:encodeSharedScene(initialWorld())})
 });
 // One TCP client, ten different forged identities. A vulnerable proxy would
 // let every creation through. The dedicated edge must overwrite both headers.
 for(let i=1;i<=10;i++){
  const response=await post('203.0.113.'+i);
  assert.equal(response.status,201,'valid creation '+i+' denied');
 }
 const limited=await post('203.0.113.50');
 assert.equal(limited.status,429);
 assert.equal((await limited.json()).error,'client_creation_rate_limited');
 const denied=await fetch(lease.lease_origin+'/worlds/api/worlds',{
  method:'POST',headers:{origin:'https://attacker.invalid','content-type':'application/json',
   'x-worlds-client-ip':'203.0.113.150'},
  body:JSON.stringify({scene_token:encodeSharedScene(initialWorld())})
 });
 assert.equal(denied.status,403);
 const health=await (await fetch(lease.lease_origin+'/worlds/api/health')).json();
 assert.equal(health.schema,'evercraft.worlds.vault.v1');
 assert.equal(health.public_origin,origin);
});
