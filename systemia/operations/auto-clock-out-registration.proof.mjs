#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const config=JSON.parse(fs.readFileSync(path.join(root,'systemia/core/resident-services.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'systemia/operations/auto-clock-out.workflow.json'),'utf8'));

assert.equal(config.schema,'evercraft.systemia.resident-supervisor-config.v1');
assert.equal(manifest.schema,'evercraft.systemia.workflow-manifest.v1');
assert.equal(manifest.workflow_key,'owned-auto-clock-out');
assert.equal(manifest.activation.default,'disabled');
assert.equal(manifest.authority.source_base44_mutation,false);

const expected=[
  {
    service_key:'remote-ops-auto-clock-out',
    app_key:'systemia-remote-ops',
    activation_env:'SYSTEMIA_REMOTE_OPS_AUTO_CLOCK_OUT_ENABLED'
  },
  {
    service_key:'internal-ops-auto-clock-out',
    app_key:'evercraft-internal-ops',
    activation_env:'SYSTEMIA_INTERNAL_OPS_AUTO_CLOCK_OUT_ENABLED'
  }
];

for(const row of expected){
  const service=(config.services||[]).find((item)=>item.service_key===row.service_key);
  assert.ok(service,'missing service '+row.service_key);
  assert.equal(service.mode,'cycle');
  assert.equal(service.manifest,'systemia/operations/auto-clock-out.workflow.json');
  assert.equal(service.executable,'systemia/operations/auto-clock-out-runner.mjs');
  assert.equal(service.cadence_seconds,300);
  assert.equal(service.enabled_when_env,row.activation_env);
  assert.equal(service.env_args?.['--state-dir'],'SYSTEMIA_APP_FABRIC_STATE_DIR');
  const args=service.static_args||[];
  assert.equal(args[args.indexOf('--app-key')+1],row.app_key);
  assert.equal(args[args.indexOf('--cutoff-hours')+1],'12');
  assert.equal(service.optional_when_unconfigured,true,false);
}

console.log(JSON.stringify({
  schema:'evercraft.operations.auto-clock-out-registration-proof.v1',
  status:'pass',
  registered_services:expected.map((row)=>row.service_key),
  default_activation:'disabled',
  destination_state_binding_required:true,
  source_base44_mutation:false,
  cadence_seconds:300,
  cutoff_hours:12
}));
