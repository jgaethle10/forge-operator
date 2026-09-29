import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync(
  '.github/workflows/evercraft-control-room-canary.yml',
  'utf8'
);

test('Control Room external canary fails closed without a verified origin',()=>{
  for(const required of [
    'held_no_control_room_origin_configured',
    'public_https_verified": false',
    'authenticated_handoff_advertised": false',
  ]){
    assert.ok(workflow.includes(required),'missing held-state contract: '+required);
  }
});

test('Control Room canary requires owned HTTPS and authenticated handoff boundaries',()=>{
  for(const required of [
    "CONTROL_ROOM_ORIGIN must use HTTPS",
    "Control Room public edge must not resolve to Base44",
    '.service == "evercraft-web-browser-edge"',
    '.runtime == "Evercraft Compute"',
    '.deployment_receipt_bound == true',
    '.raw_worker_publicly_exposed == false',
    '.authenticated_human_handoff == true',
    '.authenticated_handoff_persists_profile == false',
    '.authenticated_handoff_secret_text_returned == false',
    '.private_targets == false',
    'external_saas_browser_required:false',
  ]){
    assert.ok(workflow.includes(required),'missing Control Room canary contract: '+required);
  }
});

test('Control Room canary does not create authenticated sessions or persist claims',()=>{
  assert.equal(workflow.includes('/v1/auth-browser/sessions'),false);
  assert.equal(workflow.includes('claim_token'),false);
  assert.equal(workflow.includes('x-evercraft-browser-claim'),false);
});
