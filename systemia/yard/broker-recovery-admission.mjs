// Fail-closed evidence gate for recovering a resident broker after a crash.
// This file does not start/stop services, mutate Yard state, or rebind receipts.
// Existing Yard jobs/grants must NOT be sent to a cold-started broker whose
// runtime identity changed, even if its persisted state directory is intact.
const HASH=/^sha256:[a-f0-9]{64}$/;
const INSTANCE=/^remote_broker_[a-f0-9]{24}$/;

const clean=value=>String(value??'');
export function assessResidentBrokerRecovery({yardDeployment,brokerHealth}={}){
  const yard=yardDeployment||{}, health=brokerHealth||{};
  const failures=[];
  const receipt=clean(yard.receipt?.receipt_hash);
  const expectedInstance=clean(yard.result?.instance_id);
  const actualInstance=clean(health.instance_id);
  if(yard.receipt?.workload_class!=='systemia.remote-capacity-broker.v1')
    failures.push('yard_not_remote_broker_deployment');
  if(!HASH.test(receipt))failures.push('yard_receipt_unverified');
  if(!INSTANCE.test(expectedInstance))failures.push('yard_instance_unverified');
  if(health.ok!==true||
    health.schema!=='evercraft.remote-capacity.broker-health.v1'||
    health.service!=='remote-capacity-broker'||
    health.runtime!=='Evercraft Compute')
    failures.push('broker_health_untrusted');
  if(health.secure_envelope_schema!=='evercraft.secure-envelope.v1')
    failures.push('broker_secure_envelope_unverified');
  if(!INSTANCE.test(actualInstance))failures.push('broker_instance_unverified');
  if(expectedInstance&&actualInstance&&expectedInstance!==actualInstance)
    failures.push('cold_restart_requires_new_deployment_identity');
  if(health.deployment_receipt_bound!==true)
    failures.push('broker_receipt_not_bound');
  if(receipt&&clean(health.deployment_receipt_ref)!==receipt)
    failures.push('deployment_receipt_mismatch');

  return {
    schema:'evercraft.yard.resident-broker-recovery-admission.v1',
    verified_existing_identity:failures.length===0,
    may_preserve_existing_yard_deployment:failures.length===0,
    restart_authorized:false,
    new_broker_auto_admission_authorized:false,
    reasons:[...new Set(failures)],
    required_for_cold_restart:[
      'operator_authorized_separate_cutover',
      'new_yard_deployment_receipt_and_instance_binding',
      'broker_route_reverification',
      'per_device_attestation_and_explicit_trust_validation',
      'pending_job_outcome_reconciliation_before_retry',
    ],
    secrets_read:false,
    authority_mutated:false,
    physical_broker_touched:false,
  };
}
