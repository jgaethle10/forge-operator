import test from 'node:test';
import assert from 'node:assert/strict';
import {translateObservation,buildCommercialResearchQueue} from './signal-to-demand.mjs';
const now='2026-10-07T22:00:00Z';
const base={
 schema:'evercraft.context.observation.v1',
 observation_id:'ctxobs:demo:01',source_system:'rockies',observed_at:'2026-10-07T16:00:00Z',
 evidence_state:'observed',domains:['housing','construction'],rockies_range:'housing_construction',
 provenance_refs:['https://example.gov/building-permits'],source_family:'local_permit_feeds'
};
const route=(o)=>translateObservation(o,{now});
test('housing Rockies event is research hypothesis, never a presumed lead',()=>{
 const r=route(base);
 assert.equal(r.lane,'market_research_question');
 assert.equal(r.buyer_intent_state,'unknown');
 assert.equal(r.outreach_authority,false);
 assert.equal(r.publication_authority,false);
 assert.equal(r.source_authority_inherited,false);
 assert.equal(r.offer_key,'website-audit-quick-win');
 assert.ok(!('contact' in r));
});
test('directly observed public site friction creates private proof candidate only',()=>{
 const r=route({...base,source_system:'website_audit',kind:'website_public_issue',
 site_url:'https://example.com',issue_category:'mobile contact-link mismatch',observation_id:'site01'});
 assert.equal(r.lane,'evidence_first_proof_candidate');
 assert.equal(r.public_site_url,'https://example.com/');
 assert.match(r.next_gate,/Interaction Ledger/);
 assert.equal(r.outreach_authority,false);
});
test('hazard and emergency research cannot become website audit leads',()=>{
 assert.equal(route({...base,domains:['public_health','housing']}).state,'held');
 assert.equal(route({...base,domains:['weather'],rockies_range:'weather'}).state,'held');
});
test('stale, future, private, personal, unsourced and unsupported events fail closed',()=>{
 assert.equal(route({...base,observed_at:'2026-08-01T00:00:00Z'}).reason,'stale_evidence');
 assert.equal(route({...base,observed_at:'2026-10-09T00:00:00Z'}).reason,'future_timestamp');
 assert.equal(route({...base,visibility:'restricted'}).reason,'private_or_personal_data');
 assert.equal(route({...base,contains_personal_data:true}).reason,'private_or_personal_data');
 assert.equal(route({...base,provenance_refs:['http://bad.example']}).reason,'public_provenance_missing');
 assert.equal(route({...base,source_system:'inbound_untrusted_email'}).reason,'unsupported_source');
});
test('unverified website issue cannot become a proof candidate',()=>{
 const site={...base,source_system:'website_audit',kind:'website_public_issue',
  issue_category:'broken-link',site_url:'https://example.com'};
 assert.equal(route({...site,evidence_state:'modeled'}).reason,'website_issue_unverified');
 assert.equal(route({...site,site_url:'https://username:password@example.com'}).reason,'public_site_url_missing');
 assert.equal(route({...site,issue_category:''}).reason,'issue_category_missing');
});
test('dedupes two observations from different disciplines without granting authority',()=>{
 const r=buildCommercialResearchQueue([base,base,{...base,source_system:'faie',observation_id:'ctxobs:faie:01'}],{now});
 assert.equal(r.candidate_count,2);
 assert.equal(r.held_count,0);
 assert.equal(r.execution_authority,false);
 assert.equal(r.status,'staged_research_only_not_resident_or_live');
 assert.equal(r.candidates[1].source_system,'faie');
});
