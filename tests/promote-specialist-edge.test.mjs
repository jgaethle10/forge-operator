import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  validateExternalCanary,
  promoteSpecialistSpecs,
} from '../systemia/yard/promote-specialist-edge.mjs';

const baseSpecs=JSON.parse(fs.readFileSync('distribution/direct-plugin-specs.json','utf8'));

function pendingFixture(){
  const specs=structuredClone(baseSpecs);
  for(const product of specs.products){
    if(!['ibmi-rescue','foundry-app-escape','site-survive'].includes(product.slug)) continue;
    product.state='yard_runtime_proven_public_route_pending';
    product.registry_name=null;
    product.mcp_url=null;
    product.public_origin_state='https_route_unbound';
    delete product.public_edge_canary;
    delete product.registry_publication_receipt;
  }
  return specs;
}

function verifiedReceipt(overrides={}){
  return {
    schema:'evercraft.public-edge.external-canary.v1',
    verified:true,
    state:'public_https_verified',
    origin:'https://specialists.evercraft.example',
    runtime:'Evercraft Compute',
    service:'specialist-handoff-mcp',
    instance_id:'specialist_handoff_test_instance',
    deployment_receipt_ref:'sha256:'+'a'.repeat(64),
    public_https_verified:true,
    certificate_validation:'system_default_trust_store',
    mcp_initialize_verified:true,
    mcp_tools_list_verified:true,
    read_only_authority_verified:true,
    founder_login_required:false,
    external_saas_route_provider_required:false,
    observed_at:'2026-09-26T21:30:00Z',
    ...overrides,
  };
}

test('verified external canary promotes exactly the three Yard specialists without claiming registry publication',()=>{
  const specs=pendingFixture();
  const nonTargetsBefore=new Map(
    specs.products
      .filter(p=>!['ibmi-rescue','foundry-app-escape','site-survive'].includes(p.slug))
      .map(p=>[p.slug,JSON.stringify(p)])
  );

  const result=promoteSpecialistSpecs(specs,verifiedReceipt());
  assert.equal(result.receipt.promoted.length,3);
  assert.equal(result.receipt.registry_publication_proven,false);
  assert.equal(result.receipt.public_origin,'https://specialists.evercraft.example');

  for(const row of result.receipt.promoted){
    const product=result.specs.products.find(p=>p.slug===row.slug);
    assert.equal(product.state,'public_https_verified_registry_pending');
    assert.equal(product.registry_name,null);
    assert.equal(product.public_origin_state,'external_canary_verified');
    assert.equal(product.mcp_url,'https://specialists.evercraft.example'+product.runtime_path);
    assert.equal(product.public_edge_canary.verified,true);
    assert.equal(product.public_edge_canary.registry_publication_proven,false);
    assert.equal(product.public_edge_canary.deployment_receipt_ref,'sha256:'+'a'.repeat(64));
  }

  for(const [slug,before] of nonTargetsBefore){
    assert.equal(
      JSON.stringify(result.specs.products.find(p=>p.slug===slug)),
      before,
      slug+' must not change during specialist-edge promotion'
    );
  }
});

test('promotion is idempotent for the same canary receipt',()=>{
  const first=promoteSpecialistSpecs(pendingFixture(),verifiedReceipt());
  const second=promoteSpecialistSpecs(first.specs,verifiedReceipt());
  assert.equal(second.receipt.changed,0);
});

test('held canary cannot promote direct doors',()=>{
  assert.throws(
    ()=>promoteSpecialistSpecs(pendingFixture(),verifiedReceipt({
      verified:false,
      state:'held_no_public_origin_configured',
      public_https_verified:false,
    })),
    /external_canary_not_verified/
  );
});

test('Base44 can never satisfy the Evercraft public-edge promotion gate',()=>{
  assert.throws(
    ()=>validateExternalCanary(verifiedReceipt({
      origin:'https://something.base44.app',
    })),
    /must_not_be_base44/
  );
});

test('registry publication cannot be inferred from a public execution canary',()=>{
  const result=promoteSpecialistSpecs(pendingFixture(),verifiedReceipt());
  for(const slug of ['ibmi-rescue','foundry-app-escape','site-survive']){
    const product=result.specs.products.find(p=>p.slug===slug);
    assert.equal(product.registry_name,null);
    assert.notEqual(product.state,'registry_published_direct_mcp_existing');
  }
});


test('already-published specialist remains idempotent on the same verified origin',()=>{
  const specs=pendingFixture();
  const first=promoteSpecialistSpecs(specs,verifiedReceipt());
  for(const product of first.specs.products){
    if(!['ibmi-rescue','foundry-app-escape','site-survive'].includes(product.slug)) continue;
    product.state='registry_published_direct_mcp_existing';
    product.registry_name='io.github.jgaethle10/'+product.slug;
    product.public_edge_canary.registry_publication_proven=true;
  }
  const second=promoteSpecialistSpecs(first.specs,verifiedReceipt());
  assert.equal(second.receipt.changed,0);
  assert.equal(second.receipt.promoted.length,3);
  assert.ok(second.receipt.promoted.every(row=>row.state==='already_registry_published'));
});

test('published registry remote cannot silently move to a different public edge',()=>{
  const specs=pendingFixture();
  const first=promoteSpecialistSpecs(specs,verifiedReceipt());
  for(const product of first.specs.products){
    if(!['ibmi-rescue','foundry-app-escape','site-survive'].includes(product.slug)) continue;
    product.state='registry_published_direct_mcp_existing';
    product.registry_name='io.github.jgaethle10/'+product.slug;
    product.public_edge_canary.registry_publication_proven=true;
  }
  assert.throws(
    ()=>promoteSpecialistSpecs(first.specs,verifiedReceipt({
      origin:'https://replacement.evercraft.example',
    })),
    /published_registry_remote_change_requires_versioned_republication/
  );
});
