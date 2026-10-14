import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  assessIngressEvidence, ingressClaimsMessage, CLAIM_SCHEMA, ENVELOPE_SCHEMA,
  SNAPSHOT_SCHEMA,
} from './ingress-readiness.mjs';
const MISSION = 'synthetic-nondisputed-internal-canary';
const ORDER = 'synthetic-systemia-order-001';
const NOW = new Date('2026-10-14T23:30:00.000Z');
const OBSERVED = '2026-10-14T23:29:00.000Z';
const EXPIRY = '2026-10-14T23:36:00.000Z';
const REVISION = 'a'.repeat(40);
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const trustedObservers = {
  'test-verifier': { issuer: 'base44', public_key_pem: publicKey.export({type:'spki',format:'pem'}) },
};
const claims = () => ({
  schema:CLAIM_SCHEMA, scope:'systemia.ingress.observe', issuer:'base44',
  mission_key:MISSION, dispatch_order_id:ORDER, trace_id:'trace-001',
  transport_run_id:'transport-001', runtime_revision:REVISION,
  observed_at:OBSERVED, expires_at:EXPIRY,
});
const attest = (input = claims()) => ({
  schema:ENVELOPE_SCHEMA, key_id:'test-verifier', claims:input,
  signature_base64:sign(null, ingressClaimsMessage(input), privateKey).toString('base64'),
});
const make = () => ({
  schema:SNAPSHOT_SCHEMA, scope:'internal_non_disputed', legal_hold:false,
  source_ci:{conclusion:'success',run_id:'ci-source-only'},
  order:{id:ORDER,mission_key:MISSION,status:'acknowledged',acknowledged_at:OBSERVED},
  trace:{trace_id:'trace-001',dispatch_order_id:ORDER,agent_name:'Systemia',
    status:'completed',started_at:OBSERVED},
  transport:{kind:'entity_trigger',run_id:'transport-001',
    status:'completed',observed_at:OBSERVED},
  runtime:{revision:REVISION,source:'live_runtime_readback',observed_at:OBSERVED},
  attestation:attest(),
});
const evaluate = snapshot => assessIngressEvidence({
  snapshot, expectedMissionKey:MISSION, expectedOrderId:ORDER, trustedObservers, now:NOW,
});
test('exact, fresh, independently signed Systemia ingress transport can be verified read-only',()=>{
  const result=evaluate(make());
  assert.equal(result.state,'ingress_transport_verified');
  assert.equal(result.independent_observer_signature_verified,true);
  assert.equal(result.live_ingress_verified,true);
  assert.equal(result.execution_authority_granted,false);
  assert.equal(result.external_contact_authorized,false);
  assert.equal(result.publication_authorized,false);
  assert.equal(result.production_release_authorized,false);
  assert.equal(result.agent_mission_completed,false);
});
test('GitHub CI success by itself cannot turn an unacknowledged mission green',()=>{
  const snapshot=make();
  snapshot.order.status='dispatched';
  snapshot.order.acknowledged_at=null;
  snapshot.trace=null;
  snapshot.transport=null;
  snapshot.runtime=null;
  snapshot.attestation=null;
  const verdict=evaluate(snapshot);
  assert.equal(verdict.state,'blocked');
  assert.equal(verdict.source_ci_reported_success,true);
  assert.equal(verdict.live_ingress_verified,false);
  assert.ok(verdict.issues.includes('order_unacknowledged'));
  assert.ok(verdict.issues.includes('independent_runtime_attestation_not_verified'));
});
test('no unsigned, spoofed, expired, or wrong-key observation is sufficient',()=>{
  const blank=make();blank.attestation=null;
  assert.equal(evaluate(blank).state,'blocked');
  const mutated=make();mutated.attestation.claims.runtime_revision='b'.repeat(40);
  assert.equal(evaluate(mutated).state,'blocked');
  const wrong=make();wrong.attestation.key_id='unknown-key';
  assert.equal(evaluate(wrong).state,'blocked');
  const expired=make();expired.attestation=attest({...claims(),expires_at:'2026-10-14T23:29:01.000Z'});
  assert.equal(evaluate(expired).state,'blocked');
});
test('a stale heartbeat or trace blocks the ingress claim even with a signed receipt',()=>{
  const stale=make();stale.transport.observed_at='2026-10-14T22:00:00.000Z';
  assert.ok(evaluate(stale).issues.includes('transport_receipt_missing_or_stale'));
  const missing=make();missing.trace.status='failed';
  assert.ok(evaluate(missing).issues.includes('systemia_trace_missing_or_stale'));
});
test('cross-mission, cross-order, failed hold and scope changes are denied',()=>{
  const wrong=make();wrong.order.id='other-order';
  assert.ok(evaluate(wrong).issues.includes('order_identity_mismatch'));
  const held=make();held.legal_hold=true;
  assert.ok(evaluate(held).issues.includes('legal_hold'));
  const scope=make();scope.scope='unknown';
  assert.ok(evaluate(scope).issues.includes('scope_not_cleared'));
  const signer=make();signer.attestation=attest({...claims(),mission_key:'other-mission'});
  assert.ok(evaluate(signer).issues.includes('independent_runtime_attestation_not_verified'));
});
test('unanticipated signed claim fields cannot silently extend verifier authority',()=>{
  assert.throws(()=>ingressClaimsMessage({...claims(),can_send:true}),/invalid_ingress_claim_shape/);
  const result=evaluate({...make(),source_ci:{conclusion:'failure'}});
  assert.equal(result.live_ingress_verified,true);
  assert.equal(result.source_ci_reported_success,false);
  assert.equal(result.execution_authority_granted,false);
});
