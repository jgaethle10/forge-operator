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

test('external canary proves the purpose-specific OpenAI profile and standalone tool',()=>{
  for(const required of [
    '.fabric_openai_mcp_path == "/mcp/openai"',
    '"${SPECIALIST_ORIGIN%/}/mcp/openai"',
    '[.result.tools[].name] == ["inspect_public_website"]',
    '.result.tools[0].annotations.openWorldHint == true',
    '"inspect_public_website"',
    '"authorized_to_inspect":true',
    '"website_inspection"',
    'openai_profile_verified:true',
    'openai_mcp_path:"/mcp/openai"',
    'openai_tools:["inspect_public_website"]',
    'openai_commerce_enabled:false',
  ]){
    assert.ok(workflow.includes(required),'missing OpenAI profile canary contract: '+required);
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

test('external canary proves every OpenAI directory listing page',()=>{
  for(const required of [
    'verify_listing_page "/" "Evercraft Fabric"',
    'verify_listing_page "/openai" "Evercraft Website Inspector"',
    'verify_listing_page "/support" "Evercraft Fabric Support"',
    'verify_listing_page "/privacy" "Evercraft Fabric Privacy Policy"',
    'verify_listing_page "/terms" "Evercraft Fabric Terms of Service"',
    'listing_pages_verified:true',
    'listing_pages:["/","/openai","/support","/privacy","/terms"]',
    'bash scripts/build-evercraft-openai-plugin.sh',
  ]){
    assert.ok(workflow.includes(required),'missing OpenAI listing-page canary contract: '+required);
  }
});


test('external canary rejects a specialist edge that still routes through Base44',()=>{
  assert.ok(
    workflow.includes('.base44_transport_enabled == false'),
    'public specialist edge must prove Base44 transport is disabled'
  );
  assert.ok(
    workflow.includes('handoff_url // ""'),
    'specialist tool canary must inspect returned handoff URLs'
  );
  assert.ok(
    workflow.includes('test("base44\\\\.app"; "i")'),
    'specialist tool canary must reject Base44 handoff URLs'
  );
});
