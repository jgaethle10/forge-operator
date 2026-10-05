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
