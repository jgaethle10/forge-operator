import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/evercraft-public-edge-canary.yml','utf8');

test('external canary requires field admission evidence before public promotion',()=>{
  for(const required of [
    '.field_enrollment_bound == true',
    '.field_verified == true',
    '.field_enrollment_receipt_ref',
    '.public_edge_admission_receipt_ref',
    'field_enrollment_verified:true',
    'field_enrollment_receipt_ref:$field_enrollment',
    'public_edge_admission_receipt_ref:$public_edge_admission',
  ]){
    assert.ok(workflow.includes(required),'missing canary field contract: '+required);
  }
});

test('external canary verifies every resident Systemia Remote Ops tool',()=>{
  const required=[
    '"/mcp/systemia-remote-ops" "systemia-remote-ops"',
    '"route_business_decision"',
    '"simulate_pricing_change"',
    '"simulate_business_scenario"',
    '"get_decision_lab_capabilities"',
  ];
  for(const value of required){
    assert.ok(workflow.includes(value),'missing Remote Ops canary contract: '+value);
  }
  assert.ok(workflow.includes('local tool_d="\${6:-}"'));
  assert.ok(workflow.includes('(($d == "") or (($names | index($d)) != null))'));
});

test('external canary preserves authority and provider truth boundaries',()=>{
  for(const required of [
    'founder_login_required:false',
    'external_saas_route_provider_required:false',
    'read_only_authority_verified:true',
    'certificate_validation:"system_default_trust_store"',
  ]){
    assert.ok(workflow.includes(required),'missing public-edge truth contract: '+required);
  }
});
