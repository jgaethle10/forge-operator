import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'public-edge-controller-runner-proof-'));
const yardState=path.join(root,'yard');
const controllerState=path.join(root,'controller');
fs.mkdirSync(yardState,{recursive:true});
fs.mkdirSync(controllerState,{recursive:true});

try{
  const raw=execFileSync(
    process.execPath,
    [
      'systemia/organism/public-edge-controller-runner.mjs',
      '--yard-state',yardState,
      '--controller-state',controllerState,
    ],
    {encoding:'utf8'}
  );
  const result=JSON.parse(raw);
  assert.equal(result.ok,true);
  assert.equal(result.state,'held_waiting_for_activation_watch');
  assert.equal(result.activation_owner,'public-edge-activation-watch');
  assert.equal(result.maintenance_owner,'public-edge-controller');
  assert.equal(result.founder_login_required,false);
  assert.equal(result.payment_authority,false);

  const source=fs.readFileSync(
    'systemia/organism/public-edge-controller-runner.mjs',
    'utf8'
  );
  for(const forbidden of [
    '--capacity-endpoint',
    '--allocator-token-file',
    '--tls-key-path',
    '--tls-cert-path',
    '--base-domain',
    '.provision({',
  ]){
    assert.equal(
      source.includes(forbidden),
      false,
      'resume-only runner must not contain '+forbidden
    );
  }
  assert.ok(source.includes('.resume({rebindIfNeeded:true})'));

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.public-edge.controller-runner-proof.v1',
    holds_before_activation:true,
    activation_owner:'public-edge-activation-watch',
    maintenance_owner:'public-edge-controller',
    manual_capacity_endpoint_removed:true,
    manual_tls_arguments_removed:true,
    allocator_token_file_removed:true,
    direct_provision_removed:true,
    founder_login_required:false,
    payment_authority:false,
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
