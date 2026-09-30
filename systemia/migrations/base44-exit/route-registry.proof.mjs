#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Base44ExitRouteRegistry } from './route-registry.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-route-registry-proof-'));
try{
  const registry=new Base44ExitRouteRegistry({stateDir:root,allowLoopbackProof:true});
  const legacy='https://legacy.example.invalid/functions/machineGateway';
  const destination='http://127.0.0.1:45123/mcp';

  const staged=registry.stage({
    productKey:'evercraft-machine-commerce',
    surface:'mcp',
    destinationUrl:destination,
    legacyUrl:legacy,
    releaseRef:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    deploymentReceiptRef:'sha256:'+'b'.repeat(64)
  });
  assert.equal(staged.record.state,'staged');
  assert.equal(registry.resolve('evercraft-machine-commerce','mcp'),null);
  assert.equal(JSON.stringify(staged).includes(legacy),false);
  assert.match(staged.record.legacy_route_fingerprint,/^sha256:[a-f0-9]{64}$/);

  assert.throws(
    ()=>registry.activate({
      productKey:'evercraft-machine-commerce',
      surface:'mcp',
      cutoverReceiptRef:'proof:cutover:premature',
      expectedRouteBindingReceiptRef:'proof:binding',
      expectedReleaseRef:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    }),
    /route_registry_verification_required/
  );

  const verified=registry.verify({
    productKey:'evercraft-machine-commerce',
    surface:'mcp',
    routeBindingReceiptRef:'sha256:'+'c'.repeat(64),
    routeProbeReceiptRef:'sha256:'+'d'.repeat(64),
    observedUrl:destination
  });
  assert.equal(verified.record.state,'verified');
  assert.equal(registry.resolve('evercraft-machine-commerce','mcp'),null);
  assert.equal(
    registry.resolve('evercraft-machine-commerce','mcp',{includeVerifiedCandidate:true}).authority,
    'verified_candidate_only'
  );

  assert.throws(
    ()=>registry.activate({
      productKey:'evercraft-machine-commerce',
      surface:'mcp',
      cutoverReceiptRef:'proof:cutover:001',
      expectedRouteBindingReceiptRef:'sha256:'+'e'.repeat(64),
      expectedReleaseRef:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    }),
    /route_registry_binding_receipt_mismatch/
  );

  const active=registry.activate({
    productKey:'evercraft-machine-commerce',
    surface:'mcp',
    cutoverReceiptRef:'proof:cutover:001',
    expectedRouteBindingReceiptRef:'sha256:'+'c'.repeat(64),
    expectedReleaseRef:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  });
  assert.equal(active.record.state,'active');
  assert.equal(registry.resolve('evercraft-machine-commerce','mcp').destination_url,destination);
  assert.equal(registry.resolve('evercraft-machine-commerce','mcp').authority,'active_cutover');

  const held=registry.deactivate({
    productKey:'evercraft-machine-commerce',
    surface:'mcp',
    receiptRef:'proof:rollback:001',
    reason:'proof rollback'
  });
  assert.equal(held.record.state,'verified');
  assert.equal(registry.resolve('evercraft-machine-commerce','mcp'),null);

  const disk=fs.readdirSync(root,{recursive:true})
    .map((name)=>path.join(root,name))
    .filter((name)=>fs.existsSync(name)&&fs.statSync(name).isFile())
    .map((name)=>fs.readFileSync(name,'utf8'))
    .join('\n');
  assert.equal(disk.includes(legacy),false);

  const health=registry.health();
  assert.equal(health.legacy_route_values_persisted,false);
  assert.equal(health.automatic_cutover_allowed,false);

  console.log(JSON.stringify({
    schema:'evercraft.base44.route-registry-proof.v1',
    status:'pass',
    staging_does_not_move_traffic:true,
    verification_does_not_move_traffic:true,
    explicit_cutover_receipt_required:true,
    release_and_binding_receipts_pinned:true,
    rollback_hold_supported:true,
    raw_legacy_routes_not_persisted:true,
    automatic_cutover_allowed:false
  }));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
