import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {projectNextGenDispatchInventory} from '../scripts/nextgen-dispatch-inventory.mjs';

const node='evercraft-node002-nextgen';
function base(){
  return {
    agent:{state:'observed_local',config_mode:'shadow',remote_jobs_enabled:false,
      telemetry_state:'FAILED_CLOSED:shadow_signed_ingest_rejected_402'},
    organism:{remote_admission:{configured:false,state:'not_configured'},
      remote_operator:{enabled:false}},
    seed:{schema:'evercraft.compute.nodeseed-receipt.v1',
      node_id:'evercraft-nextgen-organism',endpoint:'http://127.0.0.1:44701',
      private_token:'DO_NOT_EMIT'},
    health:{state:'healthy',nodeseed_health:{ok:true}},
    localProof:{schema:'evercraft.node002.local-compute-yard-browser-receipt.v1',
      node_id:node,state:'passed_local_compute_yard_browser',lease_stopped:true,
      receipt_hash:'sha256:'+'a'.repeat(64),proof:{
        private_target_rejection_verified:true,systemia_remote_admission_verified:false}},
    organismServiceState:'active',
    observedAt:'2026-10-27T02:46:13.122Z',
  };
}
test('projects the real successful local proof separately from shadow telemetry',()=>{
  const actual=projectNextGenDispatchInventory(base());
  assert.equal(actual.local_compute.previous_yard_browser_proof_passed,true);
  assert.equal(actual.local_compute.resident_nodeseed_loopback_claim,true);
  assert.equal(actual.agent.shadow_telemetry_http_402_observed,true);
  assert.equal(actual.outbound_broker.signed_cross_node_lease_verified,false);
  assert.equal(actual.outbound_broker.remote_device_authorized,'not_tested');
  assert.equal(actual.outbound_broker.production_broker_reachable,'not_tested');
  assert.equal(actual.next_gate,'independently_verify_existing_authorized_broker_origin');
});
test('redacts complete secrets, broker URLs and node identity keys even if present',()=>{
  const input=base();
  input.organism.secret='USER_SECRET_SHOULD_NEVER_PRINT';
  input.seed.private_token='NEVER_PRINT_PRIVATE_TOKEN';
  input.organism.remote_broker_url='https://fake-private-host.invalid';
  input.agent.session_secret='DO_NOT_LOG_SESSION_SECRET';
  const result=JSON.stringify(projectNextGenDispatchInventory(input));
  for(const secret of ['USER_SECRET_SHOULD_NEVER_PRINT','NEVER_PRINT_PRIVATE_TOKEN',
    'DO_NOT_LOG_SESSION_SECRET','fake-private-host.invalid'])assert.equal(result.includes(secret),false);
  assert.equal(result.includes('"remote_jobs_enabled":false'),true);
});
test('remote configuration flag is not interpreted as remote admission',()=>{
  const input=base();
  input.organism.remote_admission.configured=true;
  input.remoteBrokerConfigPresent=true;
  input.enrollmentRequestExists=true;
  input.organism.remote_operator.enabled=true;
  input.remoteOperatorConfigEnabled=true;
  const result=projectNextGenDispatchInventory(input);
  assert.equal(result.outbound_broker.configured_in_private_user_environment,true);
  assert.equal(result.outbound_broker.remote_device_authorized,'not_tested');
  assert.equal(result.outbound_broker.signed_result_on_production_identity_verified,false);
  assert.equal(result.next_gate,'inspect_broker_trust_grant_using_independent_authorized_status');
});
test('malformed local proof and identity drift can never claim a physical browser success',()=>{
  const input=base();
  input.localProof.node_id='ci-runner';
  assert.equal(projectNextGenDispatchInventory(input).local_compute.previous_yard_browser_proof_passed,false);
  input.localProof.node_id=node;
  input.localProof.lease_stopped=false;
  assert.equal(projectNextGenDispatchInventory(input).local_compute.previous_yard_browser_proof_passed,false);
});
test('only physical NextGen may execute command, hosted CI cannot impersonate it',()=>{
  const file=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/nextgen-dispatch-inventory.mjs');
  const result=spawnSync(process.execPath,[file,'--report'],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,1);
  assert.match(result.stderr,/physical_nextgen_linux_required/);
  const source=fs.readFileSync(file,'utf8');
  assert.match(source,/requireNextGenLocal/);
  assert.doesNotMatch(source,/sudo|install|setDeploymentReceipt|startOutboundNodeAgent|startNodeSeed|enable.*remote_jobs/);
});
