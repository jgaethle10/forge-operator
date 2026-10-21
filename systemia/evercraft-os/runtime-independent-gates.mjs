import { createPublicKey, verify } from 'node:crypto';

const ROLES = Object.freeze({
  systemia: 'systemia_mission_receipt_hash',
  execution_gate: 'execution_policy_hash',
  capsule: 'capsule_contract_hash',
  nodeseed: 'device_attestation_hash',
});
const SIG_SCHEMA = 'evercraft.os.runtime-independent-gate-attestation.v1';
const BODY_SCHEMA = 'evercraft.os.runtime-independent-gate-decision.v1';
const RESULT_SCHEMA = 'evercraft.os.runtime-independent-gate-result.v1';
const MAX_AGE_MS = 120_000;
const fail = reason => ({schema: RESULT_SCHEMA, state:'held', reason, verified_roles:[],
  execution_authority_granted:false, permit_minted:false, permit_consumed:false,
  process_started_claimed:false, runtime_health_claimed:false, mutation_performed:false});
function canon(value) {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canon(value[k])]));
  return value;
}
function timestamp(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(name+'_invalid');
  return Date.parse(value);
}
/** Distinct pinned roots. This is an offline verification gate, NOT Passport minting or process launch. */
export class EvercraftOsIndependentRuntimeGates {
  constructor({ handoff, pinnedAuthorityKeys } = {}) {
    if (!handoff || typeof handoff.revalidate !== 'function') throw new Error('independent_gate_handoff_required');
    if (!pinnedAuthorityKeys || Object.keys(pinnedAuthorityKeys).sort().join(',') !== Object.keys(ROLES).sort().join(',')) {
      throw new Error('independent_gate_four_role_keys_required');
    }
    this.handoff=handoff;
    this.keys=new Map(Object.keys(ROLES).map(role=>{
      const pem=pinnedAuthorityKeys[role];
      if (typeof pem !== 'string') throw new Error('independent_gate_key_invalid:'+role);
      const key=createPublicKey(pem);
      if (key.asymmetricKeyType !== 'ed25519') throw new Error('independent_gate_key_must_be_ed25519:'+role);
      const der=key.export({type:'spki',format:'der'}).toString('hex');
      return [role,{key,der}];
    }));
    if (new Set([...this.keys.values()].map(r=>r.der)).size !== 4) throw new Error('independent_gate_roles_must_use_distinct_keys');
  }

  verify({ plan, subjectRef, attestations, now = new Date() } = {}) {
    const state=this.handoff.revalidate({plan,subjectRef,now});
    if (state.state !== 'still_prepared_for_independent_gate_review') return fail('handoff_not_current:'+state.reason);
    try {
      if (!attestations || typeof attestations !== 'object' || Array.isArray(attestations) ||
          Object.keys(attestations).sort().join(',') !== Object.keys(ROLES).sort().join(',')) {
        throw new Error('independent_gate_exact_four_attestations_required');
      }
      const instant=new Date(now).getTime();
      if (!Number.isFinite(instant)) throw new Error('independent_gate_clock_invalid');
      for (const [role, evidenceKey] of Object.entries(ROLES)) {
        const envelope=attestations[role];
        if (envelope?.schema !== SIG_SCHEMA || envelope.signature_algorithm !== 'ed25519' ||
            envelope.body?.schema !== BODY_SCHEMA || typeof envelope.signature_base64 !== 'string' ||
            !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature_base64)) {
          throw new Error('independent_gate_envelope_invalid:'+role);
        }
        const b=envelope.body;
        if (Object.keys(b).sort().join(',') !== [
          'decision','evidence_hash','expires_at','issued_at','node_id','plan_fingerprint',
          'product_key','role','schema','subject_ref'
        ].sort().join(',')) throw new Error('independent_gate_fields_invalid:'+role);
        if (b.role !== role || b.decision !== 'allow' || b.evidence_hash !== plan[evidenceKey] ||
            b.plan_fingerprint !== plan.request_fingerprint || b.product_key !== plan.product_key ||
            b.node_id !== plan.node_id || b.subject_ref !== plan.subject_ref) {
          throw new Error('independent_gate_binding_or_decision_mismatch:'+role);
        }
        const issued=timestamp(b.issued_at,'independent_gate_issued_at');
        const expires=timestamp(b.expires_at,'independent_gate_expires_at');
        if (issued>instant || expires<=instant || expires<=issued || expires-issued>MAX_AGE_MS || issued<timestamp(plan.prepared_at,'plan_prepared_at')) {
          throw new Error('independent_gate_not_fresh:'+role);
        }
        const signature=Buffer.from(envelope.signature_base64,'base64');
        if (signature.length!==64 || !verify(null,Buffer.from(JSON.stringify(canon(b))),this.keys.get(role).key,signature)) {
          throw new Error('independent_gate_signature_not_verified:'+role);
        }
      }
      return {schema:RESULT_SCHEMA,state:'independent_evidence_verified_for_passport_review',
        verified_roles:Object.keys(ROLES),request_fingerprint:plan.request_fingerprint,
        independent_root_keys:true, referenced_policy_evidence_crypto_verified:true,
        // A signature authenticates a decision, not a deployment or an actual process.
        execution_authority_granted:false,permit_minted:false,permit_consumed:false,
        process_started_claimed:false,runtime_health_claimed:false,mutation_performed:false};
    } catch (error) { return fail(String(error?.message || error)); }
  }
}
