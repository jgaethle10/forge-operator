import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script=fs.readFileSync('scripts/fabric-edge-external-canary.mjs','utf8');

test('external Fabric canary proves the mobile surface and health metadata',()=>{
  assert.ok(script.includes("getText('/mobile')"));
  assert.ok(script.includes("receipt.checks.mobile_surface=true"));
  assert.ok(script.includes("mobile_surface_identity_missing"));
  assert.ok(script.includes("health.mobile_path!=='/mobile'"));
  assert.ok(script.includes("health.mobile_installable!==true"));
  assert.ok(script.includes("mobile_health_metadata_missing"));
});

test('mobile failure is a first-class canary stage',()=>{
  assert.ok(script.includes("if(checks.mobile_surface!==true) return 'mobile_surface'"));
});


test('external Fabric canary proves Visual Desk page, catalog, social card, motion stage, and health metadata',()=>{
  assert.ok(script.includes("getText('/visuals/')"));
  assert.ok(script.includes("getJson('/visuals/index.json')"));
  assert.ok(script.includes("washington-active-volcanoes"));
  assert.ok(script.includes("card-story.svg"));
  assert.ok(script.includes("__evercraftRenderAt"));
  assert.ok(script.includes("__evercraftRenderFrame"));
  assert.ok(script.includes("receipt.checks.visual_desk=true"));
  assert.ok(script.includes("health.visual_desk_ready!==true"));
  assert.ok(script.includes("health.visual_desk_motion_capable!==true"));
});

test('Visual Desk failure is a first-class external canary stage',()=>{
  assert.ok(script.includes("if(checks.visual_desk!==true) return 'visual_desk'"));
});


test('external Fabric canary proves Visual Desk ingest exists and blocks unauthenticated mutation',()=>{
  assert.ok(script.includes("timedFetch(origin+'/api/visuals/ingest'"));
  assert.ok(script.includes("negativeVisualIngest.status!==401"));
  assert.ok(script.includes("visual_ingest_unauthorized"));
  assert.ok(script.includes("visual_desk_ingest_auth_gate_failed"));
  assert.ok(script.includes("health.visual_desk_ingest_ready!==true"));
  assert.ok(script.includes("health.visual_desk_ingest_publication_authority!==false"));
});


test('external Fabric canary distinguishes deployment lag from a broken ingest auth gate',()=>{
  assert.ok(script.includes("negativeVisualIngest.status===404"));
  assert.ok(script.includes("visual_desk_ingest_route_not_deployed"));
  assert.ok(script.includes("negativeVisualIngest.status===503"));
  assert.ok(script.includes("visual_desk_ingest_credential_not_ready"));
  assert.ok(script.includes("visual_desk_ingest_auth_gate_failed"));
});
