import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {startAmbientWorkApi} from '../systemia/saban/ambient-work-api.mjs';
import {AmbientDeviceRegistry} from '../systemia/saban/ambient-device-registry.mjs';
import {normalizeMicroDeviceManifest} from '../systemia/saban/microseed-device-bridge.mjs';

test('Saban authority queue is readable but only pairing authority can turn exact request into ticket',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-authority-api-'));
  const queueRoot=path.join(root,'work-queue');
  const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});
  const manifest=normalizeMicroDeviceManifest({
    device_id:'candidate-auth-01',
    device_class:'mini-pc',
    bridge_mode:'native_agent',
    compute_execution_mode:'native_device',
    authorization_ref:'candidate-observation-only',
    endpoint:'https://candidate.invalid/evercraft',
    supported_workloads:['systemia.content-hash.v1','systemia.telemetry-normalizer.v1'],
    resources:{cpu_units:2,memory_mb:4096,storage_gb:32},
    max_concurrency:2,
    duty_cycle:'always_on',
    attestation:{mode:'device',device_identity:'candidate-key'},
    observed_at:'2026-10-02T03:30:00.000Z',
  });
  registry.observe({device_id:manifest.device_id,observed_at:'2026-10-02T03:30:00.000Z'});
  registry.candidate({device_id:manifest.device_id,manifest});

  const request={
    schema:'evercraft.saban.capacity-authority-request.v1',
    request_id:'saban-auth-test-001',
    device_id:manifest.device_id,
    manifest_hash:manifest.manifest_hash,
    requested_scope:{
      workloads:['systemia.content-hash.v1'],
      capabilities:[],
    },
    authority_state:'explicit_owner_or_operator_approval_required',
  };
  fs.writeFileSync(path.join(root,'authority-requests.json'),JSON.stringify({
    schema:'evercraft.saban.capacity-authority-queue.v1',
    authority_requests:[request],
    observed_authority_leads:[],
    generated_at:'2026-10-02T03:31:00.000Z',
    receipt_hash:'sha256:'+'c'.repeat(64),
  },null,2));

  const api=await startAmbientWorkApi({
    queueRoot,
    stateDir:root,
    host:'127.0.0.1',
    port:0,
    authorizationToken:'work-secret',
    pairingAuthorizationToken:'pair-secret',
  });
  try{
    const unauthorized=await fetch(api.url+'/v1/capacity/authority-requests');
    assert.equal(unauthorized.status,401);

    const listRes=await fetch(api.url+'/v1/capacity/authority-requests',{
      headers:{authorization:'Bearer work-secret'},
    });
    assert.equal(listRes.status,200);
    const list=await listRes.json();
    assert.equal(list.authority_request_count,1);
    assert.equal(list.authority_requests[0].request_id,request.request_id);
    assert.equal(list.authority_granted_by_read,false);
    assert.equal(list.observation_is_not_authority,true);

    const wrongDesk=await fetch(
      api.url+'/v1/pairing/authority-requests/'+request.request_id+'/approve',
      {
        method:'POST',
        headers:{'content-type':'application/json','x-evercraft-pairing-token':'wrong'},
        body:JSON.stringify({approval_ref:'owner-approved-test'}),
      }
    );
    assert.equal(wrongDesk.status,401);

    const approve=await fetch(
      api.url+'/v1/pairing/authority-requests/'+request.request_id+'/approve',
      {
        method:'POST',
        headers:{'content-type':'application/json','x-evercraft-pairing-token':'pair-secret'},
        body:JSON.stringify({approval_ref:'owner-approved-test'}),
      }
    );
    assert.equal(approve.status,201);
    const issued=await approve.json();
    assert.equal(issued.schema,'evercraft.saban.authority-request-pairing-ticket.v1');
    assert.equal(issued.request_id,request.request_id);
    assert.equal(issued.device_id,manifest.device_id);
    assert.equal(issued.authority_source,'explicit_pairing_desk_approval');
    assert.equal(issued.production_eligible,false);
    assert.equal(issued.execution_gateway_authority,false);
    assert.deepEqual(issued.ticket.allowed_device_classes,['mini-pc']);
    assert.deepEqual(issued.ticket.allowed_workloads,['systemia.content-hash.v1']);
    assert.equal(issued.ticket.explicit_owner_approval_required,true);
    assert.equal(issued.ticket.safe_to_publish,false);
    assert.match(issued.ticket.pairing_uri,/^evercraft:\/\/microseed\/pair\?/);
  }finally{
    await api.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('manifest drift invalidates a previously generated authority request',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-authority-drift-'));
  const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});
  const manifest=normalizeMicroDeviceManifest({
    device_id:'candidate-drift-01',
    device_class:'desktop',
    bridge_mode:'native_agent',
    compute_execution_mode:'native_device',
    authorization_ref:'candidate',
    endpoint:'https://candidate.invalid',
    supported_workloads:['systemia.content-hash.v1'],
    resources:{cpu_units:4,memory_mb:8192,storage_gb:64},
    max_concurrency:2,duty_cycle:'always_on',
    attestation:{mode:'device',device_identity:'key-a'},
    observed_at:'2026-10-02T03:30:00.000Z',
  });
  registry.observe({device_id:manifest.device_id,observed_at:'2026-10-02T03:30:00.000Z'});
  registry.candidate({device_id:manifest.device_id,manifest});
  fs.writeFileSync(path.join(root,'authority-requests.json'),JSON.stringify({
    schema:'evercraft.saban.capacity-authority-queue.v1',
    authority_requests:[{
      schema:'evercraft.saban.capacity-authority-request.v1',
      request_id:'saban-auth-stale',
      device_id:manifest.device_id,
      manifest_hash:'sha256:'+'d'.repeat(64),
      requested_scope:{workloads:['systemia.content-hash.v1'],capabilities:[]},
    }],
    observed_authority_leads:[],
  }));
  const api=await startAmbientWorkApi({
    queueRoot:path.join(root,'work-queue'),
    stateDir:root,
    host:'127.0.0.1',
    port:0,
    authorizationToken:'work-secret',
    pairingAuthorizationToken:'pair-secret',
  });
  try{
    const res=await fetch(api.url+'/v1/pairing/authority-requests/saban-auth-stale/approve',{
      method:'POST',
      headers:{'content-type':'application/json','x-evercraft-pairing-token':'pair-secret'},
      body:JSON.stringify({approval_ref:'owner-approved-test'}),
    });
    assert.equal(res.status,409);
    const body=await res.json();
    assert.equal(body.error,'saban_authority_request_manifest_changed');
  }finally{
    await api.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
