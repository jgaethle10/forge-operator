import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { AmbientDeviceRegistry } from '../systemia/saban/ambient-device-registry.mjs';
import { normalizeMicroDeviceManifest } from '../systemia/saban/microseed-device-bridge.mjs';
import { createMicroSeedLanApiAdapter } from '../systemia/saban/microseed-lan-api-adapter.mjs';
import { startMicroSeedGateway } from '../systemia/saban/microseed-gateway.mjs';

async function startDeviceApi(){
  let reads=0;
  let writes=0;
  const server=http.createServer(async(req,res)=>{
    if(req.headers.authorization!=='Bearer device-secret'){
      res.writeHead(401,{'content-type':'application/json'});
      return res.end(JSON.stringify({error:'unauthorized'}));
    }
    if(req.method==='GET'&&req.url==='/status'){
      reads+=1;
      res.writeHead(200,{'content-type':'application/json'});
      return res.end(JSON.stringify({temperature_c:3.5,door_open:false}));
    }
    if(req.method==='POST'&&req.url==='/set'){
      writes+=1;
      const chunks=[]; for await(const c of req) chunks.push(c);
      res.writeHead(200,{'content-type':'application/json'});
      return res.end(JSON.stringify({accepted:true,input:JSON.parse(Buffer.concat(chunks).toString('utf8'))}));
    }
    res.writeHead(404,{'content-type':'application/json'});
    res.end(JSON.stringify({error:'not_found'}));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();
  return {
    url:'http://127.0.0.1:'+address.port,
    counts:()=>({reads,writes}),
    close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())),
  };
}

function activeRegistry(root,manifest){
  const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});
  registry.observe({device_id:manifest.device_id});
  registry.candidate({device_id:manifest.device_id,manifest});
  registry.authorize({
    device_id:manifest.device_id,
    approval_ref:'owner-approved-device',
    expires_at:new Date(Date.now()+3600000).toISOString(),
    heartbeat_target_seconds:300,
    attestation_mode:'gateway_bound',
    attestation_identity:'gateway-key',
  });
  registry.heartbeat({
    device_id:manifest.device_id,
    capability_manifest_hash:manifest.manifest_hash,
    attestation_identity:'gateway-key',
  });
  return registry;
}

test('Saban invokes a declared read-only LAN API capability and replays idempotently',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-lan-capability-'));
  const api=await startDeviceApi();
  let gateway=null;
  try{
    const manifest=normalizeMicroDeviceManifest({
      device_id:'fridge-lan-01',
      device_class:'refrigerator',
      bridge_mode:'lan_api',
      compute_execution_mode:'none',
      authorization_ref:'owner-fridge',
      endpoint:api.url,
      supported_workloads:[],
      capabilities:[{
        kind:'observation',
        operations:['observe'],
        protocol:'https-json',
        metadata:{
          http:{
            operations:{
              observe:{method:'GET',path:'/status'},
            },
          },
        },
      }],
      resources:{cpu_units:0,memory_mb:0,storage_gb:0},
      attestation:{mode:'gateway_bound',gateway_identity:'gateway-key'},
    });
    activeRegistry(root,manifest);

    const adapter=createMicroSeedLanApiAdapter({
      allowInsecureLan:true,
      credentialResolver:async()=>({bearer:'device-secret'}),
    });
    gateway=await startMicroSeedGateway({
      registryRoot:path.join(root,'registry'),
      stateDir:path.join(root,'gateway-state'),
      authorizationToken:'gateway-secret',
      bridgeAdapters:{lan_api:adapter},
    });

    const request={
      device_id:'fridge-lan-01',
      capability_index:0,
      operation:'observe',
      idempotency_key:'read-status-1',
      payload:null,
    };
    const invoke=()=>fetch(gateway.url+'/v1/capabilities/invoke',{
      method:'POST',
      headers:{authorization:'Bearer gateway-secret','content-type':'application/json'},
      body:JSON.stringify({request}),
    });

    const first=await invoke();
    assert.equal(first.status,200);
    const body=await first.json();
    assert.equal(body.capability_kind,'observation');
    assert.equal(body.result.body.temperature_c,3.5);
    assert.equal(body.result.credential_exposed,false);
    assert.equal(body.approval_value_exposed,false);
    assert.equal(api.counts().reads,1);

    const replay=await invoke();
    assert.equal(replay.status,200);
    assert.equal((await replay.json()).deduplicated,true);
    assert.equal(api.counts().reads,1);
  }finally{
    if(gateway) await gateway.close();
    await api.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('consequential LAN API actuation requires a per-action approval reference',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-lan-actuation-'));
  const api=await startDeviceApi();
  let gateway=null;
  try{
    const manifest=normalizeMicroDeviceManifest({
      device_id:'controller-lan-01',
      device_class:'embedded-controller',
      bridge_mode:'lan_api',
      compute_execution_mode:'none',
      authorization_ref:'owner-controller',
      endpoint:api.url,
      supported_workloads:[],
      capabilities:[{
        kind:'actuation',
        operations:['set_mode'],
        protocol:'https-json',
        metadata:{
          consequential:true,
          requires_per_action_approval:true,
          http:{
            operations:{
              set_mode:{method:'POST',path:'/set'},
            },
          },
        },
      }],
      resources:{cpu_units:0,memory_mb:0,storage_gb:0},
      attestation:{mode:'gateway_bound',gateway_identity:'gateway-key'},
    });
    activeRegistry(root,manifest);

    const adapter=createMicroSeedLanApiAdapter({
      allowInsecureLan:true,
      credentialResolver:async()=>({bearer:'device-secret'}),
    });
    gateway=await startMicroSeedGateway({
      registryRoot:path.join(root,'registry'),
      stateDir:path.join(root,'gateway-state'),
      authorizationToken:'gateway-secret',
      bridgeAdapters:{lan_api:adapter},
    });

    const base={
      device_id:'controller-lan-01',
      capability_index:0,
      operation:'set_mode',
      idempotency_key:'set-mode-1',
      payload:{mode:'eco'},
    };
    const blocked=await fetch(gateway.url+'/v1/capabilities/invoke',{
      method:'POST',
      headers:{authorization:'Bearer gateway-secret','content-type':'application/json'},
      body:JSON.stringify({request:base}),
    });
    assert.equal(blocked.status,422);
    assert.match((await blocked.json()).error,/approval_required/);
    assert.equal(api.counts().writes,0);

    const allowed=await fetch(gateway.url+'/v1/capabilities/invoke',{
      method:'POST',
      headers:{authorization:'Bearer gateway-secret','content-type':'application/json'},
      body:JSON.stringify({request:{...base,approval_ref:'operator-approved-mode-change'}}),
    });
    assert.equal(allowed.status,200);
    const body=await allowed.json();
    assert.equal(body.result.body.accepted,true);
    assert.match(body.approval_ref_hash,/^sha256:/);
    assert.equal(body.approval_value_exposed,false);
    assert.equal(api.counts().writes,1);
  }finally{
    if(gateway) await gateway.close();
    await api.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
