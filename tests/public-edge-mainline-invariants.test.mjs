import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { promoteSpecialistSpecs, validateExternalCanary } from '../systemia/yard/promote-specialist-edge.mjs';
import { evaluatePublicEdgeFieldMission } from '../systemia/organism/public-edge-field-mission.mjs';

const specs=JSON.parse(fs.readFileSync('distribution/direct-plugin-specs.json','utf8'));
const pendingSlugs=[
  'ibmi-rescue',
  'foundry-app-escape',
  'site-survive',
  'systemia-remote-ops',
];

function verifiedCanary(overrides={}){
  return {
    schema:'evercraft.public-edge.external-canary.v1',
    verified:true,
    state:'public_https_verified',
    origin:'https://specialists.edge.evercraft.test',
    runtime:'Evercraft Compute',
    service:'specialist-handoff-mcp',
    instance_id:'specialist_production_instance',
    deployment_receipt_ref:'sha256:'+'a'.repeat(64),
    device_fingerprint:'sha256:'+'b'.repeat(64),
    edge_attestation_receipt_ref:'sha256:'+'c'.repeat(64),
    specialist_attestation_receipt_ref:'sha256:'+'d'.repeat(64),
    public_https_verified:true,
    mcp_initialize_verified:true,
    mcp_tools_list_verified:true,
    mcp_tool_calls_verified:true,
    read_only_authority_verified:true,
    identity_attestation_verified:true,
    same_device_binding:true,
    field_enrollment_verified:true,
    field_enrollment_receipt_ref:'sha256:'+'e'.repeat(64),
    public_edge_admission_receipt_ref:'sha256:'+'f'.repeat(64),
    founder_login_required:false,
    external_saas_route_provider_required:false,
    observed_at:'2026-09-27T19:45:00.000Z',
    ...overrides,
  };
}

test('all shared-edge specialists fail closed before external HTTPS verification',()=>{
  const rows=pendingSlugs.map((slug)=>{
    const product=specs.products.find((x)=>x.slug===slug);
    assert.ok(product,'missing '+slug);
    return product;
  });

  assert.equal(rows.length,4);
  for(const product of rows){
    assert.equal(product.state,'yard_runtime_proven_public_route_pending',product.slug);
    assert.equal(product.mcp_url,null,product.slug);
    assert.equal(product.registry_name,null,product.slug);
    assert.equal(product.public_origin_state,'https_route_unbound',product.slug);
    assert.equal(product.runtime_workload_class,'systemia.specialist-handoff-mcp.v1',product.slug);
    assert.match(product.runtime_path,/^\/mcp\//,product.slug);
  }
});

test('external canary refuses missing field or same-device proof and refuses Base44 edge origin',()=>{
  assert.throws(
    ()=>validateExternalCanary(verifiedCanary({field_enrollment_verified:false})),
    /external_canary_not_verified/
  );
  assert.throws(
    ()=>validateExternalCanary(verifiedCanary({same_device_binding:false})),
    /external_canary_not_verified/
  );
  assert.throws(
    ()=>validateExternalCanary(verifiedCanary({origin:'https://example.base44.app'})),
    /must_not_be_base44/
  );
});

test('one verified Evercraft edge receipt promotes all four specialists but not registry publication',()=>{
  const copy=structuredClone(specs);
  const result=promoteSpecialistSpecs(copy,verifiedCanary());
  assert.equal(result.receipt.promoted.length,4);
  assert.equal(result.receipt.registry_publication_proven,false);

  for(const slug of pendingSlugs){
    const product=result.specs.products.find((x)=>x.slug===slug);
    assert.equal(product.state,'public_https_verified_registry_pending',slug);
    assert.equal(product.registry_name,null,slug);
    assert.equal(
      product.mcp_url,
      'https://specialists.edge.evercraft.test'+product.runtime_path,
      slug
    );
    assert.equal(product.public_edge_canary?.verified,true,slug);
    assert.equal(product.public_edge_canary?.identity_attestation_verified,true,slug);
    assert.equal(product.public_edge_canary?.same_device_binding,true,slug);
    assert.equal(product.public_edge_canary?.field_enrollment_verified,true,slug);
    assert.equal(product.public_edge_canary?.registry_publication_proven,false,slug);
  }
});

test('field mission does not hand control to Systemia until physical field certification is complete',()=>{
  const waiting=evaluatePublicEdgeFieldMission({
    node001Mission:{
      status:'waiting_on_field_evidence',
      completed_steps:['field_kit_ready','preflight_passed'],
      human_field_action_required:true,
    },
    directPluginSpecs:specs,
  });
  assert.equal(waiting.mission.status,'waiting_on_field_evidence');
  assert.equal(waiting.mission.systemia_autonomy_ready,false);
  assert.equal(waiting.mission.founder_login_required,false);

  const ready=evaluatePublicEdgeFieldMission({
    node001Mission:{
      status:'complete',
      completed_steps:[
        'field_evidence_candidate_ready',
        'yard_enrollment_verified',
        'live_identity_attested',
        'kaidance_field_pulse_verified',
        'continuity_receipt_verified',
      ],
      human_field_action_required:false,
    },
    directPluginSpecs:specs,
  });
  assert.equal(ready.mission.status,'ready_for_systemia');
  assert.equal(ready.mission.field_verified,true);
  assert.equal(ready.mission.systemia_autonomy_ready,true);
  assert.equal(ready.mission.founder_login_required,false);
});
