#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildActiveRouteOverlay } from '../systemia/migrations/base44-exit/route-overlay.mjs';
import { buildCommercialDiscoveryMesh } from '../systemia/chum/build-commercial-discovery-mesh.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-chum-route-overlay-'));
const previous=process.env.EVERCRAFT_ACTIVE_ROUTE_OVERLAY;

function writeJson(relative,value){
  const file=path.join(root,relative);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
function prepareRoot(){
  writeJson('public/.well-known/evercraft-machine-catalog.json',{
    offers:[{
      public_id:'proof-offer-v1',
      name:'Proof Offer',
      problem:'Prove route overlay behavior.',
      pricing:'$1',
      commercial_state:'sell_now',
      machine_state:'invocation_ready',
      intent_terms:['proof route']
    }]
  });
  writeJson('public/chum/answers/index.json',{doors:[]});
  writeJson('public/.well-known/evercraft-products.json',{products:[]});
}

try{
  prepareRoot();
  delete process.env.EVERCRAFT_ACTIVE_ROUTE_OVERLAY;
  const fallback=buildCommercialDiscoveryMesh({root});
  assert.equal(fallback.machine_gateway_authority,'static_capability_fallback');
  let record=JSON.parse(fs.readFileSync(path.join(root,'public/chum/commercial/proof-offer-v1/index.json'),'utf8'));
  assert.equal(
    record.human_review_url,
    'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/capabilities/proof-offer-v1/index.html'
  );
  assert.equal(record.human_review_url.includes('base44.app'),false);

  const overlay=buildActiveRouteOverlay([{
    state:'active',
    product_key:'evercraft-machine-commerce',
    surface:'gateway',
    destination_url:'https://owned-gateway.example.invalid/machine-commerce',
    release_ref:'proof-release',
    deployment_receipt_ref:'proof-deploy',
    route_binding_receipt_ref:'proof-bind',
    route_probe_receipt_ref:'proof-probe',
    cutover_receipt_ref:'proof-cutover'
  }],{observedAt:'2026-09-30T23:00:00.000Z'});
  const overlayFile=path.join(root,'active-route-overlay.json');
  fs.writeFileSync(overlayFile,JSON.stringify(overlay,null,2)+'\n');
  process.env.EVERCRAFT_ACTIVE_ROUTE_OVERLAY=overlayFile;

  const migrated=buildCommercialDiscoveryMesh({root});
  assert.equal(migrated.machine_gateway_authority,'active_cutover');
  assert.equal(migrated.machine_gateway_cutover_receipt_ref,'proof-cutover');
  record=JSON.parse(fs.readFileSync(path.join(root,'public/chum/commercial/proof-offer-v1/index.json'),'utf8'));
  assert.equal(
    record.human_review_url,
    'https://owned-gateway.example.invalid/machine-commerce?view=service&public_id=proof-offer-v1'
  );
  assert.equal(record.human_review_url.includes('base44.app'),false);

  console.log(JSON.stringify({
    schema:'evercraft.chum.commercial-route-overlay-proof.v1',
    status:'pass',
    static_capability_fallback_before_active_cutover:true,
    owned_gateway_selected_after_active_cutover:true,
    generated_review_urls_follow_overlay:true
  }));
}finally{
  if(previous===undefined) delete process.env.EVERCRAFT_ACTIVE_ROUTE_OVERLAY;
  else process.env.EVERCRAFT_ACTIVE_ROUTE_OVERLAY=previous;
  fs.rmSync(root,{recursive:true,force:true});
}
