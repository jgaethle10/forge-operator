// Pure reconciliation. No remote commands, service control or filesystem writes.
// The resident must independently verify every observation before supplying it.
const NODE='evercraft-node002-nextgen';
export function reconcileActivationOutcome({intent,observation}={}){
 if(intent?.schema!=='evercraft.node002.activation-ledger.v1'||intent.state!=='verified_intent_pending_reconciliation'||intent.execution_authorized!==false||!Number.isSafeInteger(intent.last_sequence)||intent.last_sequence<1)throw Error('activation_intent_invalid');
 if(observation?.node_id!==NODE||observation.sequence!==intent.last_sequence||observation.activation_grant_sha256!==intent.activation_grant_sha256)throw Error('activation_observation_binding_denied');
 const healthy=observation.local_health_verified===true&&observation.broker_attestation_verified===true&&observation.source_integrity_verified===true;
 const activated=healthy&&observation.commit===intent.commit&&observation.phase===intent.phase&&observation.previous_jobs_drained===true;
 const rolledBack=healthy&&observation.commit===intent.rollback_commit&&observation.phase===intent.rollback_phase&&observation.rollback_verified===true;
 return Object.freeze({...intent,state:activated||rolledBack?'reconciled':'verified_intent_pending_reconciliation',outcome:activated?'activated':rolledBack?'rolled_back':'held_unverified',observed_commit:observation.commit??null,execution_authorized:false});
}
