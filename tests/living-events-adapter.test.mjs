import test from 'node:test';
import assert from 'node:assert/strict';
import { readLivingEventCandidates, buildLivingEventCandidates } from '../systemia/living-events/candidate-adapter.mjs';

test('Systemia read-only adapter produces one independently attributable packet per event', () => {
  const packets = readLivingEventCandidates();
  assert.equal(packets.length,3);
  const ids = new Set(packets.map(packet => packet.event_id));
  assert.equal(ids.size,3);
  for (const packet of packets) {
    assert.equal(packet.schema,'evercraft.systemia.living-event-candidate.v1');
    assert.equal(packet.candidate_state,'UNADMITTED_SOURCE_PACKET');
    assert.equal(packet.systemia_admission,'not_acknowledged');
    assert.equal(packet.intended_consumer,'systemia_editorial_review');
    assert.equal(packet.publication_authority,false);
    assert.equal(packet.dispatch_authority,false);
    assert.equal(packet.external_contact_authority,false);
    assert.equal(packet.payment_authority,false);
    assert.equal(packet.geography.mode,'conceptual');
    assert.equal(packet.geography.surveyed_coordinates,false);
    assert.equal(packet.geography.safe_route_authority,false);
    assert.equal(packet.source_count,packet.sources.length);
    assert.match(packet.source_digest_sha256,/^sha256:[a-f0-9]{64}$/);
    const sourceIds = new Set(packet.sources.map(s=>s.ref));
    for (const claim of packet.claims) {
      assert.ok(['chronology','theme'].includes(claim.claim_kind));
      assert.ok(claim.provenance_refs.length);
      for (const ref of claim.provenance_refs) assert.ok(sourceIds.has(ref));
      assert.ok(!('x' in claim));
      assert.ok(!('y' in claim));
    }
    assert.ok(packet.review_gates.includes('systemia_admission_receipt'));
  }
});
test('Systemia adapter is deterministic and source-only', () => {
 assert.deepEqual(readLivingEventCandidates(),readLivingEventCandidates());
 const item = readLivingEventCandidates().find(p=>p.event_id.includes('nepal'));
 assert.ok(item);
 assert.ok(item.sources.length>=2);
 assert.ok(item.claims.some(c=>c.evidence_state==='unresolved'));
});
test('Systemia adapter refuses unvalidated claim changes', () => {
 assert.throws(()=>buildLivingEventCandidates({
   nepal:{sources:[{id:'S',url:'https://example.com'}]},
   helens:{},yakima:{}
 }),/missing|invalid/);
});
