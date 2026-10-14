import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script=fs.readFileSync('scripts/faie-agnormal-external-canary.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/faie-agnormal-launch-gate.yml','utf8');

test('FAIE AgNormal launch canary proves the exact partner room',()=>{
  assert.ok(script.includes("getText('/faie/agnormal/')"));
  assert.ok(script.includes('Prepared for AgNormal'));
  assert.ok(script.includes('One real decision\\. Live evidence\\. No theater\\.'));
  assert.ok(script.includes('id="activityHud"'));
  assert.ok(script.includes('Cancel operation'));
  assert.ok(script.includes('Download handed off'));
  assert.ok(script.includes('fetchWithTimeout'));
  assert.ok(script.includes('faie_agnormal_base44_reference'));
});

test('FAIE AgNormal launch canary runs a bounded live investigation',()=>{
  assert.ok(script.includes("postJson('/api/faie/investigate'"));
  assert.ok(script.includes('evercraft.faie.investigation.v1'));
  assert.ok(script.includes('SENSE_CHALLENGE_DECIDE'));
  assert.ok(script.includes('evidence_acquisition_queue'));
  assert.ok(script.includes('human_review_required!==true'));
  assert.ok(script.includes('action_authority!==false'));
  assert.ok(script.includes('decision_authority!==false'));
  assert.ok(script.includes('publication_authority!==false'));
});

test('FAIE AgNormal launch canary verifies owned health and native MCP',()=>{
  assert.ok(script.includes("health.design_partner_surface!=='/faie/agnormal/'"));
  assert.ok(script.includes("health.base44_transport_enabled!==false"));
  assert.ok(script.includes("health.public_preview_persists_queries!==false"));
  assert.ok(script.includes("rpc('/mcp/faie'"));
  for(const tool of [
    'investigate_faie_evidence',
    'compare_faie_candidates',
    'get_faie_signal_snapshot',
    'get_faie_health'
  ]){
    assert.ok(script.includes(tool));
  }
});

test('FAIE launch workflow publishes a dedicated status and receipt',()=>{
  assert.ok(workflow.includes('name: FAIE AgNormal Launch Gate'));
  assert.ok(workflow.includes('scripts/faie-agnormal-external-canary.mjs'));
  assert.ok(workflow.includes('evercraft/faie-agnormal-launch'));
  assert.ok(workflow.includes('faie-agnormal-launch-gate.json'));
  assert.ok(workflow.includes('actions/upload-artifact@v4'));
});

test('FAIE launch workflow retries only deploy-lag signatures',()=>{
  assert.ok(workflow.includes('http_404:/faie/agnormal/'));
  assert.ok(workflow.includes('faie_health_design_partner_path_mismatch'));
  assert.ok(workflow.includes('json_post_http_404:/api/faie/investigate'));
  assert.ok(workflow.includes('retry=false'));
});
