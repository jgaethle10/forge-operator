import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evaluateOperatorPublicEdgeAdmission } from './operator-public-edge-admit.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const nodeReceipt={
  schema:'evercraft.compute.nodeseed-receipt.v1',
  node_id:'chromebook-penguin',
  device_fingerprint:'sha256:'+'a'.repeat(64),
};

const externalBody={
  schema:'evercraft.operator-public-edge.external-canary.v1',
  origin:'https://fabric.systemiacommandcenters.com',
  hostname:'fabric.systemiacommandcenters.com',
  trust_class:'operator_authorized_public_edge',
  physical_field_certified:false,
  founder_login_required:false,
  base44_transport_required:false,
  verified:true,
  checks:{public_dns:true,trusted_tls:true,runtime_health:true,mcp_initialize:true,mcp_tools:true,public_catalog:true},
  dns_ipv4:['50.46.190.39'],
  tls:{
    authorized:true,
    fingerprint256:'AA:BB:CC',
    valid_to:'2030-01-01T00:00:00.000Z',
    days_remaining:1000,
  },
  health:{
    service:'evercraft-fabric-local',
    server:'evercraft-fabric',
    version:'1.0.0',
    capability_count:46,
    read_only:true,
    transactional:false,
    external_action_authority:false,
    base44_transport_enabled:false,
  },
  mcp_tools:['match_evercraft_capability','list_evercraft_capabilities','get_evercraft_connection_options'],
  catalog_total:46,
  edge_attestation_verified:true,
  device_fingerprint:nodeReceipt.device_fingerprint,
  node_id:nodeReceipt.node_id,
  attestation_observed_at:'2026-10-01T01:00:00.000Z',
  physical_field_claim:false,
  state:'public_https_verified',
  public_https_verified:true,
  mcp_verified:true,
  external_route_verified:true,
  observed_at:'2026-10-01T01:00:00.000Z',
};
const externalCanary={...externalBody,receipt_hash:sha(externalBody)};
const localHealth={
  ok:true,
  service:'evercraft-fabric-local',
  server:'evercraft-fabric',
  capability_count:46,
  read_only:true,
  transactional:false,
  external_action_authority:false,
  base44_transport_enabled:false,
};
const serviceStates=[
  {name:'evercraft-fabric.service',scope:'system',active:'active',enabled:'enabled'},
  {name:'evercraft-public-edge.service',scope:'system',active:'active',enabled:'enabled'},
  {name:'evercraft-router-map.timer',scope:'system',active:'active',enabled:'enabled'},
];

const receipt=evaluateOperatorPublicEdgeAdmission({
  nodeReceipt,
  externalCanary,
  localHealth,
  serviceStates,
  operatorRef:'founder-authorized-chromebook-edge',
});
assert.equal(receipt.state,'production_edge_admitted');
assert.equal(receipt.trust_class,'operator_authorized_public_edge');
assert.equal(receipt.ready_for_public_edge_enrollment,true);
assert.equal(receipt.public_https_verified,true);
assert.equal(receipt.physical_field_certified,false);
assert.equal(receipt.node001_claimed,false);
assert.equal(receipt.cryptographic_external_device_binding,true);
assert.equal(receipt.device_binding_state,'signed_nonce_verified');
assert.equal(receipt.base44_transport_required,false);
assert.equal(receipt.private_key_exposed,false);
assert.equal(receipt.certificate_bytes_exposed,false);
assert.match(receipt.receipt_hash,/^sha256:[a-f0-9]{64}$/);

const failedRouteBody={...externalBody,verified:false,public_https_verified:false,external_route_verified:false};
const failedRouteCanary={...failedRouteBody,receipt_hash:sha(failedRouteBody)};
assert.throws(
  ()=>evaluateOperatorPublicEdgeAdmission({
    nodeReceipt,
    externalCanary:failedRouteCanary,
    localHealth,serviceStates,operatorRef:'founder',
  }),
  /external_public_https_not_verified/
);
assert.throws(
  ()=>evaluateOperatorPublicEdgeAdmission({
    nodeReceipt,externalCanary,
    localHealth:{...localHealth,base44_transport_enabled:true},
    serviceStates,operatorRef:'founder',
  }),
  /local_fabric_base44_transport_enabled/
);
assert.throws(
  ()=>evaluateOperatorPublicEdgeAdmission({
    nodeReceipt,externalCanary,localHealth,
    serviceStates:serviceStates.filter(x=>x.name!=='evercraft-router-map.timer'),
    operatorRef:'founder',
  }),
  /router_map_residency_not_ready/
);
assert.throws(
  ()=>evaluateOperatorPublicEdgeAdmission({
    nodeReceipt,
    externalCanary:{...externalCanary,receipt_hash:'sha256:'+'f'.repeat(64)},
    localHealth,serviceStates,operatorRef:'founder',
  }),
  /external_canary_receipt_hash_invalid/
);

const mismatchBody={...externalBody,device_fingerprint:'sha256:'+'b'.repeat(64)};
const mismatchCanary={...mismatchBody,receipt_hash:sha(mismatchBody)};
assert.throws(
  ()=>evaluateOperatorPublicEdgeAdmission({
    nodeReceipt,externalCanary:mismatchCanary,localHealth,serviceStates,operatorRef:'founder',
  }),
  /external_device_fingerprint_mismatch/
);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.operator-public-edge-admission-proof.v1',
  operator_authorized_production_edge:true,
  physical_node001_claimed:false,
  external_https_required:true,
  trusted_tls_required:true,
  resident_services_required:true,
  router_map_residency_required:true,
  local_base44_transport_forbidden:true,
  signed_nonce_device_binding_required:true,
  external_device_binding_not_overstated:true,
},null,2));
