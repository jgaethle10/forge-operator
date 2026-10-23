import test from 'node:test';
import assert from 'node:assert/strict';
import {assessFabricParity,fabricParityProbeFailureReceipt} from '../scripts/audit-public-fabric-parity.mjs';

const source={capabilities:[
 {public_id:'known-v1',public_url:'https://fabric.systemiacommandcenters.com/capabilities/known-v1'},
 {public_id:'lineage-founding-pilot-v1',public_url:'https://fabric.systemiacommandcenters.com/capabilities/lineage-founding-pilot-v1'},
]};
const health={ok:true,capability_count:1,source_release_ref:null,source_release_ref_bound:false,deployment_receipt_bound:false,deployment_receipt_ref:null};
const observations=[
 {public_id:'known-v1',url:source.capabilities[0].public_url,status:200,html_identity_verified:true},
 {public_id:'lineage-founding-pilot-v1',url:source.capabilities[1].public_url,status:404,html_identity_verified:null},
];
const exceptions={known_source_only_capabilities:['lineage-founding-pilot-v1'],
 known_nonworking_public_routes:[source.capabilities[1].public_url],
 expires_at:'2026-10-22T00:00:00Z'};
const args={source,liveIds:['known-v1'],health,observations,exceptions,now:'2026-10-15T17:00:00Z'};
test('known, timed 404 is tolerated for monitoring but never becomes live or paid',()=>{
 const r=assessFabricParity(args);
 assert.equal(r.ok,true);
 assert.deepEqual(r.source_only_ids,['lineage-founding-pilot-v1']);
 assert.equal(r.route_ok_count,1);
 assert.equal(r.known_404_exception_count,1);
 assert.equal(r.release_lineage_state,'HOLD_MISSING_DEPLOYMENT_LINEAGE');
 assert.equal(r.checkout_end_to_end_verified,false);
 assert.equal(r.paid_receipt_verified,false);
});
test('exception expires rather than masking the missing production capability',()=>{
 const r=assessFabricParity({...args,now:'2026-10-22T00:00:00Z'});
 assert.equal(r.ok,false);
 assert.ok(r.findings.includes('source_live_exception_expired'));
 assert.ok(r.findings.some(x=>x.includes('advertised_url_not_200')));
});
test('newly missing live capability and new 404 fail independently',()=>{
 const one={public_id:'other-v1',public_url:'https://fabric.systemiacommandcenters.com/capabilities/other-v1'};
 const r=assessFabricParity({...args,source:{capabilities:[...source.capabilities,one]},
  observations:[...observations,{public_id:'other-v1',url:one.public_url,status:404,html_identity_verified:null}]});
 assert.equal(r.ok,false);
 assert.ok(r.findings.includes('unexpected_live_catalog_missing:other-v1'));
 assert.ok(r.findings.includes('advertised_url_not_200:other-v1:404'));
});
test('public 200 with wrong owned product identity fails',()=>{
 const r=assessFabricParity({...args,observations:[{...observations[0],html_identity_verified:false},observations[1]]});
 assert.equal(r.ok,false);
 assert.ok(r.findings.includes('owned_capability_page_content_mismatch:known-v1'));
});
test('catalog count mismatch, silent missing URL checks and live-only capabilities fail closed',()=>{
 const r=assessFabricParity({...args,liveIds:['known-v1','unexpected-v1'],observations:[observations[0]]});
 assert.equal(r.ok,false);
 assert.ok(r.findings.includes('health_catalog_count_mismatch'));
 assert.ok(r.findings.includes('unexpected_live_catalog_extra:unexpected-v1'));
 assert.ok(r.findings.includes('source_route_not_checked:lineage-founding-pilot-v1'));
});
test('deployment refs are reported as claims only, not independently signed in this audit',()=>{
 const r=assessFabricParity({...args,health:{...health,
  source_release_ref_bound:true,source_release_ref:'a'.repeat(40),
  deployment_receipt_bound:true,deployment_receipt_ref:'b'.repeat(64)}});
 assert.equal(r.ok,true);
 assert.equal(r.release_lineage_state,'RECEIPTS_REPORTED_NOT_INDEPENDENTLY_VERIFIED');
});
test('empty or missing data is not a green health state',()=>{
 assert.throws(()=>assessFabricParity({}),/parity_source_or_observation_missing/);
});

test('scoped, unexpired $250 Workflow X-Ray source-only exception reports missing MCP without pretending deployment',()=>{
 const offer={public_id:'workflow-foundry-xray-v1',public_url:'https://fabric.systemiacommandcenters.com/offers/workflow-xray'};
 const extendedSource={capabilities:[...source.capabilities,offer]};
 const scopedExceptions={...exceptions,known_source_only_capabilities:[...exceptions.known_source_only_capabilities,offer.public_id]};
 const observed=[...observations,{public_id:offer.public_id,url:offer.public_url,status:200,html_identity_verified:null}];
 const result=assessFabricParity({...args,source:extendedSource,observations:observed,exceptions:scopedExceptions});
 assert.equal(result.ok,true);
 assert.ok(result.source_only_ids.includes(offer.public_id));
 assert.equal(result.source_capabilities,3);
 assert.equal(result.live_mcp_capabilities,1);
 assert.equal(result.deployment_receipt_bound,false);
 assert.equal(result.release_lineage_state,'HOLD_MISSING_DEPLOYMENT_LINEAGE');
 assert.equal(result.paid_receipt_verified,false);
 const withoutException=assessFabricParity({...args,source:extendedSource,observations:observed});
 assert.equal(withoutException.ok,false);
 assert.ok(withoutException.findings.includes('unexpected_live_catalog_missing:'+offer.public_id));
 const expired=assessFabricParity({...args,source:extendedSource,observations:observed,exceptions:scopedExceptions,now:'2026-10-22T00:00:00Z'});
 assert.equal(expired.ok,false);
 assert.ok(expired.findings.includes('source_live_exception_expired'));
});

test('external fetch failure emits a serializable red receipt with no invented readiness',()=>{
 const receipt=fabricParityProbeFailureReceipt(
  Object.assign(new Error('fetch failed'),{cause:{code:'ETIMEDOUT'}}),
  {now:'2026-10-23T21:28:33.000Z'}
 );
 const serialized=JSON.parse(JSON.stringify(receipt));
 assert.equal(serialized.ok,false);
 assert.equal(serialized.state,'HOLD_EXTERNAL_PROBE_FAILURE');
 assert.equal(serialized.cause_code,'ETIMEDOUT');
 assert.equal(serialized.live_mcp_capabilities,null);
 assert.equal(serialized.source_capabilities,null);
 assert.equal(serialized.release_lineage_state,'HOLD_PUBLIC_ORIGIN_UNVERIFIED');
 assert.equal(serialized.paid_receipt_verified,false);
 assert.equal(serialized.financial_action_taken,false);
 assert.deepEqual(serialized.findings,['external_parity_probe_failed']);
});

test('untrusted error codes are normalized before external receipt emission',()=>{
 const receipt=fabricParityProbeFailureReceipt({
  message:'outside connection unavailable',code:'secret=value;next=1'
 });
 assert.equal(receipt.cause_code,'EXTERNAL_PROBE_FAILED');
 assert.equal(receipt.ok,false);
});
