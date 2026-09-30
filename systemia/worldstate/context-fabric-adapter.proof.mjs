import assert from 'node:assert/strict';
import { toContextFabricRecord } from './context-fabric-adapter.mjs';

const record = toContextFabricRecord({
  observation_id:'rockies-yakima-grid-001',
  source_system:'rockies-public-watch',
  source_family:'utility-public-status',
  observed_at:'2026-09-29T02:00:00Z',
  region_key:'yakima',
  domains:['energy','infrastructure'],
  kind:'grid_condition',
  evidence_state:'verified',
  reliability:0.98,
  anomaly_score:0.87,
  summary:'Verified external grid condition departed from baseline.',
  provenance_refs:['public:utility:status:yakima'],
  correlation_keys:['yakima:grid']
}, {
  actor_ref:'systemia:worldstate',
  visibility:'internal'
});

assert.equal(record.namespace, 'worldstate');
assert.equal(record.idempotency_key, 'worldstate:rockies-yakima-grid-001');
assert.equal(record.required_scope, 'context.read.worldstate');
assert.equal(record.source_ref, 'public:utility:status:yakima');
assert.equal(record.evidence_state, 'observed');
assert.equal(record.content_trust_state, 'verified_external_evidence');
assert.equal(record.entity_ref, 'yakima:grid');
assert.ok(record.tags.includes('evidence:verified'));
assert.ok(record.tags.includes('domain:energy'));
assert.ok(record.text.includes('"worldstate_evidence_state":"verified"'));
assert.equal(record.claim_value.worldstate_evidence_state, 'verified');

console.log(JSON.stringify({
  ok:true,
  namespace:record.namespace,
  context_scope:record.required_scope,
  source_ref:record.source_ref,
  context_evidence_state:record.evidence_state,
  preserved_worldstate_evidence_state:record.claim_value.worldstate_evidence_state
}, null, 2));
