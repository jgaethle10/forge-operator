import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { bootstrapNativeMicroSeed } from '../systemia/saban/microseed-native-bootstrap.mjs';
import { loadMicroSeedDeviceIdentity } from '../systemia/saban/microseed-device-identity.mjs';
import {
  issueMicroSeedPairingTicket,
  createMicroSeedEnrollmentBundle,
} from '../systemia/saban/microseed-pairing.mjs';
import { startMicroSeedPairingApi } from '../systemia/saban/microseed-pairing-api.mjs';
import { submitMicroSeedEnrollmentBundle } from '../systemia/saban/microseed-enrollment-client.mjs';
import { AmbientDeviceRegistry } from '../systemia/saban/ambient-device-registry.mjs';

test('signed encrypted bundle enrolls over loopback API and burns ticket',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-pairing-api-'));
  const stateDir=path.join(root,'edge');
  const deviceRoot=path.join(root,'device');
  let api=null;
  try{
    const ticket=issueMicroSeedPairingTicket({
      stateDir,
      approval_ref:'explicit-owner-spare-02',
      device_id:'spare-02',
      allowed_device_classes:['mini-pc'],
      allowed_workloads:['systemia.content-hash.v1','systemia.blob-store.v1'],
      now:new Date('2026-10-01T05:00:00.000Z'),
    });
    const boot=bootstrapNativeMicroSeed({
      root:deviceRoot,
      device_id:'spare-02',
      device_class:'mini-pc',
      authorization_ref:ticket.ticket_id,
      endpoint:'https://spare-02.local/evercraft',
      supported_workloads:['systemia.content-hash.v1','systemia.blob-store.v1'],
      resources:{cpu_units:2,memory_mb:4096,storage_gb:40},
      now:new Date('2026-10-01T05:01:00.000Z'),
    });
    const manifest=JSON.parse(fs.readFileSync(boot.manifest_file,'utf8'));
    const identity=loadMicroSeedDeviceIdentity({
      root:boot.identity_dir,
      device_id:'spare-02',
    });
    const deviceToken=fs.readFileSync(boot.token_file,'utf8').trim();
    const bundle=createMicroSeedEnrollmentBundle({
      manifest,
      privateKey:identity.private_key,
      ticket_id:ticket.ticket_id,
      pairing_secret:ticket.pairing_secret,
      device_token:deviceToken,
      now:new Date(),
    });

    api=await startMicroSeedPairingApi({
      stateDir,
      host:'127.0.0.1',
      port:0,
    });
    const health=await fetch(api.url+'/health').then(r=>r.json());
    assert.equal(health.ok,true);
    assert.equal(health.can_issue_pairing_tickets,false);
    assert.equal(health.pairing_secret_exposed,false);
    assert.equal(health.device_token_exposed,false);

    const receipt=await submitMicroSeedEnrollmentBundle({
      enrollmentUrl:api.url,
      bundle,
    });
    assert.equal(receipt.ok,true);
    assert.equal(receipt.device_id,'spare-02');
    assert.equal(receipt.enrollment_signature_verified,true);
    assert.equal(receipt.pairing_secret_destroyed,true);
    assert.equal(receipt.device_token_exposed,false);
    assert.equal(receipt.conformance_required,true);

    const registry=new AmbientDeviceRegistry({root:path.join(stateDir,'registry')});
    const row=registry.list({now:new Date()}).rows.find(x=>x.device_id==='spare-02');
    assert.ok(row);
    assert.equal(row.eligible,true);
    assert.equal(row.conformance,null);

    const tokenFile=path.join(stateDir,'.secrets','device-tokens','spare-02.token');
    assert.equal(fs.existsSync(tokenFile),true);
    assert.equal(fs.readFileSync(tokenFile,'utf8').trim(),deviceToken);
    assert.equal(fs.statSync(tokenFile).mode&0o777,0o600);

    await assert.rejects(
      ()=>submitMicroSeedEnrollmentBundle({enrollmentUrl:api.url,bundle}),
      /http_409:microseed_pairing_ticket_already_consumed/
    );
  }finally{
    if(api) await api.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('pairing API cannot bind publicly by default',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-pairing-api-host-'));
  try{
    await assert.rejects(
      ()=>startMicroSeedPairingApi({
        stateDir:root,
        host:'0.0.0.0',
      }),
      /loopback_required/
    );
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('enrollment client requires HTTPS away from loopback and forbids URL credentials',async()=>{
  const fake={
    schema:'evercraft.microseed.enrollment-bundle.v1',
  };
  await assert.rejects(
    ()=>submitMicroSeedEnrollmentBundle({
      enrollmentUrl:'http://192.168.1.50:8794',
      bundle:fake,
      fetchImpl:async()=>{throw new Error('must_not_fetch');},
    }),
    /https_or_loopback_required/
  );
  await assert.rejects(
    ()=>submitMicroSeedEnrollmentBundle({
      enrollmentUrl:'https://user:pass@example.test',
      bundle:fake,
      fetchImpl:async()=>{throw new Error('must_not_fetch');},
    }),
    /url_credentials_forbidden/
  );
});
