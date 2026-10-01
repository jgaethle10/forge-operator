import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { AmbientDeviceRegistry } from '../systemia/saban/ambient-device-registry.mjs';
import { normalizeMicroDeviceManifest } from '../systemia/saban/microseed-device-bridge.mjs';

const cli=path.resolve(new URL('../systemia/saban/ambient-device-cli.mjs',import.meta.url).pathname);

test('device credentials are local 0600 files and never printed',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-device-credential-'));
  try{
    const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});
    const manifest=normalizeMicroDeviceManifest({
      device_id:'phone-secret-01',
      device_class:'phone',
      bridge_mode:'native_agent',
      authorization_ref:'owner-phone',
      endpoint:'https://phone.local/evercraft',
      supported_workloads:['systemia.content-hash.v1'],
      resources:{cpu_units:1,memory_mb:1024,storage_gb:8},
      attestation:{mode:'device',device_identity:'phone-key'},
    });
    registry.observe({device_id:'phone-secret-01'});
    registry.candidate({device_id:'phone-secret-01',manifest});
    registry.authorize({
      device_id:'phone-secret-01',
      approval_ref:'approve-phone',
      expires_at:new Date(Date.now()+3600000).toISOString(),
      attestation_identity:'phone-key',
    });

    const secret='super-secret-device-token';
    const source=path.join(root,'source-token.txt');
    fs.writeFileSync(source,secret+'\n',{mode:0o600});

    const setOut=execFileSync(process.execPath,[
      cli,'credential-set',
      '--root',root,
      '--device','phone-secret-01',
      '--token-file',source,
    ],{encoding:'utf8'});
    assert.equal(setOut.includes(secret),false);
    const parsed=JSON.parse(setOut);
    assert.equal(parsed.credential_value_exposed,false);

    const dest=path.join(root,'.secrets','device-tokens','phone-secret-01.token');
    assert.equal(fs.readFileSync(dest,'utf8').trim(),secret);
    assert.equal(fs.statSync(dest).mode&0o777,0o600);

    const deleteOut=execFileSync(process.execPath,[
      cli,'credential-delete',
      '--root',root,
      '--device','phone-secret-01',
    ],{encoding:'utf8'});
    assert.equal(deleteOut.includes(secret),false);
    assert.equal(JSON.parse(deleteOut).credential_removed,true);
    assert.equal(fs.existsSync(dest),false);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
