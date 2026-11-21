import test from 'node:test';
import assert from 'node:assert/strict';
import {assessConceptPlan} from '../systemia/ev-opportunity/concept-plan-qa.mjs';

const fixture=()=>({
  project_id:'DEMO-EV-001',
  site:{canonical_address:'100 Example Road, Sampletown, WA',parcel_id:'parcel-demo',source_url:'https://example.com/public-parcel',verified_at:'2026-11-11T09:00:00-08:00',rights:'cleared_independent'},
  lineage:{independent_cleared:true},brand:{historical_asset:false},
  sheets:[
    {sheet_id:'S-0',role:'site_concept',site_address:'100 Example Road, Sampletown, WA',parcel_id:'parcel-demo',status:'PRELIMINARY_NOT_FOR_CONSTRUCTION',geometry_origin:'source_derived_and_modeled',modeling_disclosure:true},
    {sheet_id:'A-0',role:'area_context',site_address:'100 Example Road, Sampletown, WA',parcel_id:'parcel-demo',status:'PRELIMINARY_NOT_FOR_CONSTRUCTION',geometry_origin:'source_derived',modeling_disclosure:true}
  ],
  imagery:[{url:'https://example.com/public-aerial',captured_or_updated_at:'2026-10-01T00:00:00Z',reuse_rights:'cleared_independent',coordinate_fit_reviewed:true}],
  proposed:{stalls:6,evse_class:'Level 2 concept',utility_capacity_verified:false,accessible_route_verified:false,trench_verified:false,site_control_verified:false,survey_verified:false},
  qa:{hash_verified:true,visual_review:'approved',technical_review:'approved',address_source_crosscheck:true,image_to_parcel_crosscheck:true}
});

test('strong declared metadata is only review-ready, never send/permit/construct',()=>{
  const o=assessConceptPlan(fixture());
  assert.equal(o.state,'REVIEW_READY');
  assert.equal(o.can_publish,false);
  assert.equal(o.can_send_to_buyer,false);
  assert.equal(o.can_construct,false);
  assert.equal(o.field_verification_notes.length,5);
});

test('mismatch between sheet and canonical address blocks release',()=>{
  const p=fixture(); p.sheets[0].site_address='200 Different Road, Sampletown, WA';
  const o=assessConceptPlan(p);
  assert.equal(o.state,'HOLD');
  assert.ok(o.hold_reasons.includes('sheet_address_mismatch:S-0'));
});

test('hash verified alone is never visual quality proof',()=>{
  const p=fixture(); p.qa.visual_review='unreviewed';
  const o=assessConceptPlan(p);
  assert.equal(o.state,'HOLD');
  assert.ok(o.hold_reasons.includes('independent_visual_review_missing'));
});

test('third-party imagery with unreviewed rights is blocked',()=>{
  const p=fixture(); p.imagery[0].reuse_rights='unknown';
  const o=assessConceptPlan(p);
  assert.equal(o.state,'HOLD');
  assert.ok(o.hold_reasons.includes('imagery_reuse_not_cleared'));
});

test('unsupported claims of capacity require official receipt',()=>{
  const p=fixture(); p.proposed.utility_capacity_verified=true;
  const o=assessConceptPlan(p);
  assert.ok(o.hold_reasons.includes('utility_claim_without_primary_receipt'));
});

test('legacy mixed lineage remains held',()=>{
  const p=fixture();p.lineage.independent_cleared=false; p.brand.historical_asset=true;
  const o=assessConceptPlan(p);
  assert.ok(o.hold_reasons.includes('historical_brand_asset_present'));
  assert.ok(o.hold_reasons.includes('plan_lineage_not_cleared'));
});
