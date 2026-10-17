import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {ingestSignedAudit,verifyReceipt,SCHEMA} from './incident-event.mjs';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const trust={"evercraft-audit-key":{public_key_pem:publicKey.export({type:'spki',format:'pem'}),tenant_id:'evercraft',source_id:'owned-scheduler-audit',actor_ids:['leased-worker-1'],permission_scopes:['audit:read']}};
const now=Date.parse('2026-10-17T08:00:20Z');
const opts={tenant_id:'evercraft',mission_id:'evercraft-agent-continuity-fabric-20261016',now};
const payload=()=>({schema:SCHEMA,tenant_id:'evercraft',mission_id:opts.mission_id,incident_id:'spider-crash-001',event_id:'evt-001',source_id:'owned-scheduler-audit',agent_id:'spider',workload_id:'leased-worker-1',operation_id:'ticket-0001',occurred_at:'2026-10-17T08:00:00Z',observed_at:'2026-10-17T08:00:01Z',clock_uncertainty_ms:1500,event_type:'worker_exit',evidence_kind:'source_observation',actor_id:'leased-worker-1',permission_scope:'audit:read',idempotency_key:'ticket-0001',upstream_event_ids:[],persistence_paths:[{type:'retry',resource_id:'retry-123',state:'unknown'}],possible_impact:['ticket-creation'],verified_impact:[],external_effect:'UNKNOWN'});
function envelope(p=payload(),key_id='evercraft-audit-key'){
 const purpose='evercraft.blackbox.readonly-ingest.v1';
 return {key_id,purpose,payload:p,signature:sign(null,Buffer.from(purpose+'\n'+JSON.stringify(p)),privateKey).toString('base64')};
}
test('signed owned source accepted read-only; external effect remains UNKNOWN',()=>{
 const e=envelope(), r=ingestSignedAudit(e,trust,opts);
 assert.equal(r.identity_state,'CONFIGURED_SOURCE_SIGNATURE_VERIFIED');
 assert.equal(r.external_effect_state,'UNKNOWN');
 assert.equal(r.external_effect_provider_verified,false);
 assert.deepEqual(r.verified_impact,[]);
 assert.equal(r.persistence_paths[0].state,'unknown');
 assert.equal(r.execution_authority,'NONE_READ_ONLY');
 assert.equal(verifyReceipt(e,r,trust,opts).verified,true);
});
test('rejects forged signature, source and in-band key changes',()=>{
 const e=envelope(); e.payload.operation_id='different'; assert.throws(()=>ingestSignedAudit(e,trust,opts),/signature/);
 assert.throws(()=>ingestSignedAudit(envelope(payload(),'attacker'),trust,opts),/untrusted/);
 const p=payload();p.source_id='compromised';assert.throws(()=>ingestSignedAudit(envelope(p),trust,opts),/identity or scope/);
});
test('cross tenant, wrong mission and actor/scope escalation denied',()=>{
 const p=payload();p.tenant_id='other-tenant';assert.throws(()=>ingestSignedAudit(envelope(p),trust,opts),/tenant or mission/);
 const q=payload();q.mission_id='wrong';assert.throws(()=>ingestSignedAudit(envelope(q),trust,opts),/tenant or mission/);
 const r=payload();r.permission_scope='workers:kill';assert.throws(()=>ingestSignedAudit(envelope(r),trust,opts),/identity or scope/);
 const s=payload();s.actor_id='unleased-agent';assert.throws(()=>ingestSignedAudit(envelope(s),trust,opts),/identity or scope/);
});
test('reject malformed and inflated records',()=>{
 for(const mutate of [p=>{p.unknown_field=true},p=>{delete p.event_id},p=>{p.clock_uncertainty_ms=-1},p=>{p.observed_at='2026-02-30T08:00:01Z'},p=>{p.upstream_event_ids=['x','x']},p=>{p.verified_impact=['real-effect']},p=>{p.external_effect='PROVIDER_VERIFIED'},p=>{p.persistence_paths[0].state='confirmed_dead'}]){
  const p=payload();mutate(p);assert.throws(()=>ingestSignedAudit(envelope(p),trust,opts));
 }
});
test('reject freshness drift and false signed receipt',()=>{
 const p=payload();p.observed_at='2026-10-16T07:00:00Z';assert.throws(()=>ingestSignedAudit(envelope(p),trust,opts),/freshness/);
 const e=envelope(), r={...ingestSignedAudit(e,trust,opts),external_effect_provider_verified:true};
 assert.throws(()=>verifyReceipt(e,r,trust,opts),/receipt mismatch/);
});
test('source signature never becomes response authority',()=>{
 const p=payload();p.evidence_kind='synthetic';p.external_effect='UNVERIFIED_COMMITTED_CLAIM';
 assert.throws(()=>ingestSignedAudit(envelope(p),trust,opts),/synthetic cannot assert effect/);
});
