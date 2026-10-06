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
