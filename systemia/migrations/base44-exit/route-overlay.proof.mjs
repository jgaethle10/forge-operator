#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildActiveRouteOverlay, resolveActiveRoute, validateActiveRouteOverlay } from './route-overlay.mjs';

const rows=[
  {
    state:'verified',
    product_key:'rivet',
    surface:'mcp',
    destination_url:'https://verified-not-active.example.invalid/mcp',
    release_ref:'release-verified',
    deployment_receipt_ref:'deploy-verified',
    route_binding_receipt_ref:'bind-verified',
    route_probe_receipt_ref:'probe-verified',
    cutover_receipt_ref:null
  },
  {
    state:'active',
    product_key:'evercraft-machine-commerce',
    surface:'gateway',
    destination_url:'https://owned-gateway.example.invalid/machine-commerce',
    release_ref:'release-active',
    deployment_receipt_ref:'deploy-active',
    route_binding_receipt_ref:'bind-active',
    route_probe_receipt_ref:'probe-active',
    cutover_receipt_ref:'cutover-active'
  }
];

const overlay=buildActiveRouteOverlay(rows,{observedAt:'2026-09-30T23:00:00.000Z'});
validateActiveRouteOverlay(overlay);
assert.equal(overlay.active_route_count,1);
assert.equal(overlay.routes[0].product_key,'evercraft-machine-commerce');
assert.equal(overlay.verified_candidates_emitted,false);
assert.equal(overlay.staged_candidates_emitted,false);

const active=resolveActiveRoute(
  overlay,
  'evercraft-machine-commerce',
  'gateway',
  {fallbackUrl:'https://legacy.example.invalid/gateway'}
);
assert.equal(active.authority,'active_cutover');
assert.equal(active.url,'https://owned-gateway.example.invalid/machine-commerce');
assert.equal(active.cutover_receipt_ref,'cutover-active');

const held=resolveActiveRoute(
  overlay,
  'rivet',
  'mcp',
  {fallbackUrl:'https://legacy.example.invalid/rivet'}
);
assert.equal(held.authority,'legacy_fallback');
assert.equal(held.url,'https://legacy.example.invalid/rivet');

assert.throws(
  ()=>buildActiveRouteOverlay([{
    ...rows[1],
    destination_url:'http://127.0.0.1:8080/machine-commerce'
  }]),
  /public_route_overlay_https_required/
);

assert.throws(
  ()=>buildActiveRouteOverlay([{
    ...rows[1],
    cutover_receipt_ref:''
  }]),
  /cutover_receipt_ref_required/
);

console.log(JSON.stringify({
  schema:'evercraft.base44.active-route-overlay-proof.v1',
  status:'pass',
  active_routes_only:true,
  verified_candidate_not_published:true,
  cutover_receipt_required:true,
  https_required:true,
  legacy_fallback_preserved_until_cutover:true
}));
