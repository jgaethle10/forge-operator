#!/usr/bin/env node
// Opt-in, loopback-only *lab* for resident broker cold-start identity safety.
// Never touches the Penguin service, live Yard state, credentials, or Node002.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startOutboundCapacityBroker} from '../systemia/network/outbound-capacity-broker.mjs';
import {assessResidentBrokerRecovery} from '../systemia/yard/broker-recovery-admission.mjs';

const RECEIPT = 'sha256:'+'b'.repeat(64);
const fakeOldDeployment = instanceId => ({
  receipt: {workload_class:'systemia.remote-capacity-broker.v1',receipt_hash:RECEIPT},
  result: {instance_id:instanceId,service_id:'svc_lab_old_broker'},
});
function invariant(ok, label) {
  if (!ok) throw new Error('isolated_broker_candidate_hold:'+label);
}

export async function proveIsolatedBrokerCandidate() {
  const labRoot = fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-broker-candidate-lab-'));
  let broker;
  try {
    broker = await startOutboundCapacityBroker({
      stateDir:path.join(labRoot,'broker'),
      host:'127.0.0.1',
      port:0,
      authorizedDevices:{},
    });
    const health = broker.health();
    const url = new URL(broker.endpoint);
    invariant(url.protocol==='http:' && url.hostname==='127.0.0.1' && Number(url.port)>0,
      'loopback_only');
    invariant(health.ok===true && health.schema==='evercraft.remote-capacity.broker-health.v1',
      'broker_health');
    invariant(/^remote_broker_[a-f0-9]{24}$/.test(health.instance_id),'new_instance_format');
    invariant(health.authorized_devices===0 && health.registered_nodes===0,
      'no_device_authority');
    invariant(health.deployment_receipt_bound===false &&
      health.deployment_receipt_ref===null, 'no_inherited_receipt');

    // The synthetic old identity is *never* the physical resident broker's.
    const syntheticOldInstance = health.instance_id==='remote_broker_'+'a'.repeat(24)
      ? 'remote_broker_'+'c'.repeat(24)
      : 'remote_broker_'+'a'.repeat(24);
    const admission = assessResidentBrokerRecovery({
      yardDeployment:fakeOldDeployment(syntheticOldInstance),
      brokerHealth:health,
    });
    invariant(admission.identity_fields_match===false, 'reject_old_identity');
    invariant(admission.verified_existing_identity===false, 'no_identity_proof');
    invariant(admission.may_preserve_existing_yard_deployment===false,
      'no_legacy_deployment_reuse');
    invariant(admission.new_broker_auto_admission_authorized===false &&
      admission.restart_authorized===false, 'no_auto_cutover');
    invariant(admission.reasons.includes('cold_restart_requires_new_deployment_identity') &&
      admission.reasons.includes('broker_receipt_not_bound'),
      'cold_start_rejection_reasons');

    return Object.freeze({
      schema:'evercraft.yard.isolated-broker-candidate-proof.v1',
      state:'passed',
      scope:'synthetic_loopback_lab_only',
      new_instance_generated:true,
      authorized_devices:0,
      registered_nodes:0,
      deployment_receipt_bound:false,
      previous_deployment_reuse_denied:true,
      automatic_cutover_denied:true,
      live_system_access:false,
      physical_node_access:false,
      legacy_identity_verified:false,
      restart_authorized:false,
    });
  } finally {
    if (broker) await broker.close();
    fs.rmSync(labRoot,{recursive:true,force:true});
  }
}

const invoked = Boolean(process.argv[1]) &&
  path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if (invoked) {
  if (process.argv.includes('--help')) {
    console.log('Usage: node scripts/prove-isolated-broker-candidate.mjs --lab');
    console.log('Temporary loopback-only proof; no production service or Yard access.');
  } else if (process.argv.length!==3 || process.argv[2]!=='--lab') {
    console.error('HOLD: explicit --lab required; never run as a resident service');
    process.exitCode=2;
  } else {
    try {
      const report=await proveIsolatedBrokerCandidate();
      console.log(JSON.stringify(report));
    } catch (error) {
      console.error(JSON.stringify({
        schema:'evercraft.yard.isolated-broker-candidate-proof.v1',
        state:'held',
        reason:String(error?.message||'lab_failed').replace(/[^a-zA-Z0-9_.:-]/g,'_').slice(0,120),
        live_system_access:false,
        restart_authorized:false,
      }));
      process.exitCode=1;
    }
  }
}
