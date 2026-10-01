import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AmbientDeviceRegistry } from '../systemia/saban/ambient-device-registry.mjs';
import { bootstrapNativeMicroSeed } from '../systemia/saban/microseed-native-bootstrap.mjs';
import { loadMicroSeedDeviceIdentity } from '../systemia/saban/microseed-device-identity.mjs';
import {
  issueMicroSeedPairingTicket,
  createMicroSeedEnrollmentBundle,
  verifyMicroSeedEnrollmentBundle,
  consumeMicroSeedPairingBundle,
} from '../systemia/saban/microseed-pairing.mjs';

test('explicit one-time pairing enrolls exact signed device and transfers credential encrypted',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-pairing-'));
  try{
    const stateDir=path.join(root,'saban');
    const deviceRoot=path.join(root,'device');
    const ticket=issueMicroSeedPairingTicket({
      stateDir,
      approval_ref:'jesse-approved-spare-box',
      device_id:'spare-box-01',
      allowed_device_classes:['mini-pc'],
      allowed_workloads:[
        'systemia.content-hash.v1',
        'systemia.rivet.source-coverage-audit.v1',
      ],
      now:new Date('2026-10-01T05:00:00.000Z'),
    });
    assert.equal(ticket.authorization_granted,false);
    assert.equal(ticket.device_credential_created,false);
    assert.equal(ticket.pairing_secret_exposed_once,true);

    const boot=bootstrapNativeMicroSeed({
      root:deviceRoot,
      device_id:'spare-box-01',
      device_class:'mini-pc',
      authorization_ref:ticket.ticket_id,
      endpoint:'https://spare-box.local/evercraft',
      supported_workloads:[
        'systemia.content-hash.v1',
        'systemia.rivet.source-coverage-audit.v1',
      ],
      resources:{cpu_units:2,memory_mb:4096,storage_gb:20},
      now:new Date('2026-10-01T05:01:00.000Z'),
    });
    const manifest=JSON.parse(fs.readFileSync(boot.manifest_file,'utf8'));
    const identity=loadMicroSeedDeviceIdentity({
      root:boot.identity_dir,
      device_id:'spare-box-01',
    });
    const deviceToken=fs.readFileSync(boot.token_file,'utf8').trim();

    const bundle=createMicroSeedEnrollmentBundle({
      manifest,
      privateKey:identity.private_key,
      ticket_id:ticket.ticket_id,
      pairing_secret:ticket.pairing_secret,
      device_token:deviceToken,
      now:new Date('2026-10-01T05:02:00.000Z'),
    });
    assert.equal(bundle.device_token_exposed,false);
    assert.equal(bundle.pairing_secret_exposed,false);
    assert.equal(JSON.stringify(bundle).includes(deviceToken),false);
    assert.equal(JSON.stringify(bundle).includes(ticket.pairing_secret),false);
    assert.equal(
      verifyMicroSeedEnrollmentBundle(bundle,{now:new Date('2026-10-01T05:02:30.000Z')}).verified,
      true
    );

    const registry=new AmbientDeviceRegistry({root:path.join(stateDir,'registry')});
    const consumed=consumeMicroSeedPairingBundle({
      stateDir,
      registry,
      bundle,
      now:new Date('2026-10-01T05:03:00.000Z'),
    });
    assert.equal(consumed.enrollment_signature_verified,true);
    assert.equal(consumed.device_token_exposed,false);
    assert.equal(consumed.pairing_secret_destroyed,true);
    assert.equal(consumed.conformance_required,true);
    assert.equal(consumed.calibration_required,true);

    const row=registry.list({
      now:new Date('2026-10-01T05:03:10.000Z'),
    }).rows.find(x=>x.device_id==='spare-box-01');
    assert.equal(row.state,'active');
    assert.equal(row.eligible,true);
    assert.equal(row.conformance,null);

    const storedToken=fs.readFileSync(
      path.join(stateDir,'.secrets','device-tokens','spare-box-01.token'),
      'utf8'
    ).trim();
    assert.equal(storedToken,deviceToken);
    assert.equal(
      fs.statSync(path.join(stateDir,'.secrets','device-tokens','spare-box-01.token')).mode&0o777,
      0o600
    );

    assert.throws(
      ()=>consumeMicroSeedPairingBundle({
        stateDir,registry,bundle,now:new Date('2026-10-01T05:04:00.000Z')
      }),
      /already_consumed/
    );
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('tampered signed enrollment bundle is rejected',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-pairing-tamper-'));
  try{
    const stateDir=path.join(root,'saban');
    const deviceRoot=path.join(root,'device');
    const ticket=issueMicroSeedPairingTicket({
      stateDir,
      approval_ref:'approved',
      allowed_device_classes:['mini-pc'],
      allowed_workloads:['systemia.content-hash.v1'],
      now:new Date('2026-10-01T05:00:00.000Z'),
    });
    const boot=bootstrapNativeMicroSeed({
      root:deviceRoot,
      device_id:'tamper-box',
      device_class:'mini-pc',
      authorization_ref:ticket.ticket_id,
      endpoint:'https://box.local',
      supported_workloads:['systemia.content-hash.v1'],
      now:new Date('2026-10-01T05:01:00.000Z'),
    });
    const manifest=JSON.parse(fs.readFileSync(boot.manifest_file,'utf8'));
    const identity=loadMicroSeedDeviceIdentity({root:boot.identity_dir});
    const bundle=createMicroSeedEnrollmentBundle({
      manifest,
      privateKey:identity.private_key,
      ticket_id:ticket.ticket_id,
      pairing_secret:ticket.pairing_secret,
      device_token:fs.readFileSync(boot.token_file,'utf8').trim(),
      now:new Date('2026-10-01T05:02:00.000Z'),
    });
    const tampered=structuredClone(bundle);
    tampered.manifest.resources.memory_mb=99999;
    assert.equal(
      verifyMicroSeedEnrollmentBundle(tampered,{now:new Date('2026-10-01T05:02:30.000Z')}).verified,
      false
    );
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('pairing ticket scopes the workloads a device may enroll',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-pairing-scope-'));
  try{
    const stateDir=path.join(root,'saban');
    const deviceRoot=path.join(root,'device');
    const ticket=issueMicroSeedPairingTicket({
      stateDir,
      approval_ref:'approved-hash-only',
      allowed_workloads:['systemia.content-hash.v1'],
      now:new Date('2026-10-01T05:00:00.000Z'),
    });
    const boot=bootstrapNativeMicroSeed({
      root:deviceRoot,
      device_id:'overreach-box',
      device_class:'mini-pc',
      authorization_ref:ticket.ticket_id,
      endpoint:'https://box.local',
      supported_workloads:[
        'systemia.content-hash.v1',
        'systemia.rivet.source-coverage-audit.v1',
      ],
      now:new Date('2026-10-01T05:01:00.000Z'),
    });
    const manifest=JSON.parse(fs.readFileSync(boot.manifest_file,'utf8'));
    const identity=loadMicroSeedDeviceIdentity({root:boot.identity_dir});
    const bundle=createMicroSeedEnrollmentBundle({
      manifest,
      privateKey:identity.private_key,
      ticket_id:ticket.ticket_id,
      pairing_secret:ticket.pairing_secret,
      device_token:fs.readFileSync(boot.token_file,'utf8').trim(),
      now:new Date('2026-10-01T05:02:00.000Z'),
    });
    const registry=new AmbientDeviceRegistry({root:path.join(stateDir,'registry')});
    assert.throws(
      ()=>consumeMicroSeedPairingBundle({
        stateDir,registry,bundle,now:new Date('2026-10-01T05:03:00.000Z')
      }),
      /workload_not_allowed/
    );
    assert.equal(registry.get('overreach-box'),null);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
