import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AmbientDeviceRegistry } from '../systemia/saban/ambient-device-registry.mjs';
import {
  issueMicroSeedPairingTicket,
  consumeMicroSeedPairingBundle,
} from '../systemia/saban/microseed-pairing.mjs';
import { createDeviceEnrollmentFromPairing } from '../systemia/saban/microseed-device-pair-cli.mjs';

test('visible pairing ticket can drive one-command device enrollment package end to end',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-device-pair-e2e-'));
  try{
    const stateDir=path.join(root,'saban');
    const deviceRoot=path.join(root,'device');
    const issue=issueMicroSeedPairingTicket({
      stateDir,
      approval_ref:'explicit-owner-approval',
      device_id:'spare-laptop-01',
      allowed_device_classes:['linux-host'],
      allowed_workloads:[
        'systemia.content-hash.v1',
        'systemia.rivet.source-coverage-audit.v1',
      ],
      ttl_ms:15*60*1000,
      now:new Date('2026-10-01T09:00:00.000Z'),
    });

    const pack=createDeviceEnrollmentFromPairing({
      pairing_uri:issue.ticket_card.pairing_uri,
      root:deviceRoot,
      device_id:'spare-laptop-01',
      device_class:'linux-host',
      endpoint:'https://spare-laptop.local/evercraft',
      supported_workloads:[
        'systemia.content-hash.v1',
        'systemia.rivet.source-coverage-audit.v1',
      ],
      resources:{cpu_units:1,memory_mb:1024,storage_gb:8},
      placement_labels:['owned','spare'],
      max_concurrency:2,
      duty_cycle:'always_on',
      now:new Date('2026-10-01T09:01:00.000Z'),
    });

    assert.equal(pack.ready_for_enrollment,true);
    assert.equal(pack.private_key_exposed,false);
    assert.equal(pack.device_token_exposed,false);
    assert.equal(pack.pairing_secret_exposed,false);
    assert.equal(pack.bundle_file_mode,'0600');

    const serialized=JSON.stringify(pack);
    assert.equal(serialized.includes(issue.pairing_secret),false);
    assert.equal(serialized.includes('PRIVATE KEY'),false);

    const bundle=JSON.parse(fs.readFileSync(pack.bundle_file,'utf8'));
    const registry=new AmbientDeviceRegistry({root:path.join(stateDir,'registry')});
    const consumed=consumeMicroSeedPairingBundle({
      stateDir,
      registry,
      bundle,
      now:new Date('2026-10-01T09:02:00.000Z'),
    });

    assert.equal(consumed.device_id,'spare-laptop-01');
    assert.equal(consumed.enrollment_signature_verified,true);
    assert.equal(consumed.conformance_required,true);
    assert.equal(consumed.calibration_required,true);

    const row=registry.list({
      now:new Date('2026-10-01T09:02:30.000Z'),
    }).rows.find(x=>x.device_id==='spare-laptop-01');
    assert.equal(row.state,'active');
    assert.equal(row.eligible,true);
    assert.equal(row.conformance,null);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('device pairing refuses expired visible ticket URI',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-device-pair-expired-'));
  try{
    const issue=issueMicroSeedPairingTicket({
      stateDir:path.join(root,'saban'),
      approval_ref:'approved',
      ttl_ms:60_000,
      now:new Date('2026-10-01T09:00:00.000Z'),
    });
    assert.throws(
      ()=>createDeviceEnrollmentFromPairing({
        pairing_uri:issue.ticket_card.pairing_uri,
        root:path.join(root,'device'),
        device_id:'late-device',
        endpoint:'https://late-device.local',
        supported_workloads:['systemia.content-hash.v1'],
        now:new Date('2026-10-01T09:02:00.000Z'),
      }),
      /expired/
    );
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
