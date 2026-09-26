import assert from 'node:assert/strict';
import {
  US_SESSION_JURISDICTIONS,
  SESSION_SOURCE_LANES,
  NATIONAL_PARTNER_LANES,
  SESSION_ACCEPTANCE,
  buildNationalSessionWorkQueue,
  coverageReceipt
} from './national-session-sprawl.mjs';

assert.equal(US_SESSION_JURISDICTIONS.length,56);
assert.equal(new Set(US_SESSION_JURISDICTIONS).size,56);
for(const required of ['WA','CA','NY','TX','FL','DC','PR'])assert.ok(US_SESSION_JURISDICTIONS.includes(required));
assert.equal(SESSION_SOURCE_LANES.length,5);
assert.ok(NATIONAL_PARTNER_LANES.length>=3);
assert.ok(SESSION_ACCEPTANCE.required_for_session_coverage.includes('charging_sessions_count'));
assert.ok(SESSION_ACCEPTANCE.forbidden_promotions.some(x=>x.includes('AADT')));

const queue=buildNationalSessionWorkQueue();
assert.equal(queue.length,56*5+NATIONAL_PARTNER_LANES.length);
assert.equal(queue.filter(x=>x.jurisdiction==='WA').length,5);
assert.equal(queue.filter(x=>x.jurisdiction==='US').length,NATIONAL_PARTNER_LANES.length);
assert.ok(queue.every(x=>x.canonical_entity==='EVObservedUsageAggregate'));

const receipt=coverageReceipt([
  {aggregate_key:'wa:1',station_external_id:'s1',jurisdiction:'WA',latitude:46.6,longitude:-120.5,period_start:'2026-01-01T00:00:00Z',period_granularity:'month',charging_sessions_count:31,source_ref:'public:test'},
  {aggregate_key:'fake-model',station_external_id:'s2',jurisdiction:'CA',latitude:34,longitude:-118,period_start:'2026-01-01T00:00:00Z',period_granularity:'month',charging_sessions_count:null,source_ref:'model:test'}
]);
assert.equal(receipt.accepted_session_rows,1);
assert.equal(receipt.accepted_sites,1);
assert.deepEqual(receipt.jurisdictions_with_accepted_rows,['WA']);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.rivet.session-sprawl-proof.v1',
  jurisdictions:US_SESSION_JURISDICTIONS.length,
  jurisdiction_lane_work_units:US_SESSION_JURISDICTIONS.length*SESSION_SOURCE_LANES.length,
  national_partner_lanes:NATIONAL_PARTNER_LANES.length,
  total_work_units:queue.length,
  canonical_entity:SESSION_ACCEPTANCE.canonical_entity,
  modeled_promotion_forbidden:true
},null,2));
