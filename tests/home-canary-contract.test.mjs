import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync(
  '.github/workflows/evercraft-home-canary.yml',
  'utf8'
);

test('Home canary fails closed without a verified origin',()=>{
  for(const required of [
    'held_no_home_origin_configured',
    '"public_https_verified": false',
    '"anonymous_access_denied": false',
  ]){
    assert.ok(workflow.includes(required),'missing held-state contract: '+required);
  }
});

test('Home canary requires sovereign HTTPS and auth boundaries',()=>{
  for(const required of [
    'HOME_ORIGIN must use HTTPS',
    'Evercraft Home public edge must not resolve to Base44',
    '.service == "evercraft-home"',
    '.runtime == "Evercraft Compute"',
    '.workload_class == "systemia.evercraft-home.v1"',
    '.authority == "evercraft"',
    '.auth_mode == "passport"',
    '.deployment_receipt_bound == true',
    '.identity_login_configured == true',
    '.session_revocation_supported == true',
    '.base44_required == false',
    '.external_ai_required == false',
    '.legacy_provider_required == false',
    'test "$session_code" = "401"',
    '.state == "session_required"',
    'certificate_validation:"system_default_trust_store"',
  ]){
    assert.ok(workflow.includes(required),'missing Home canary contract: '+required);
  }
});

test('Home canary never submits credentials or creates sessions',()=>{
  assert.equal(workflow.includes('/api/login'),false);
  assert.equal(workflow.includes('evercraft_session='),false);
  assert.equal(workflow.includes('EVERCRAFT_IDENTITY_SECRET'),false);
  assert.equal(workflow.includes('EVERCRAFT_OWNER_PASSWORD'),false);
  assert.equal(/["']password["']\s*:|password=|--data[^\n]*password|authorization:\s*basic/i.test(workflow),false);
});


const ownedEdgeWorkflow=fs.readFileSync(
  '.github/workflows/evercraft-home-owned-edge-canary.yml',
  'utf8'
);

test('owned-edge Home canary persists only verified external proof',()=>{
  for(const required of [
    'if: success()',
    'conformance/runtime-observations/evercraft-home-owned-edge-latest.json',
    'git rev-parse origin/main',
    'Record verified Personal Evercraft Home edge',
  ]){
    assert.ok(ownedEdgeWorkflow.includes(required),'missing durable Home receipt contract: '+required);
  }
  assert.ok(ownedEdgeWorkflow.includes('permissions:\n  contents: write'));
  assert.equal(ownedEdgeWorkflow.includes('/api/login'),false);
  assert.equal(/EVERCRAFT_IDENTITY_SECRET|EVERCRAFT_OWNER_PASSWORD|claim_code/i.test(ownedEdgeWorkflow),false);
});
