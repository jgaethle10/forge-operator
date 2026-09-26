import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { YardOperator } from './operator.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'field-enrollment-packet-proof-'));
const computeRoot=path.join(root,'compute');
const yardState=path.join(root,'yard');
const token='field-packet-proof-allocator-secret';

const seed=await startNodeSeed({
  root:computeRoot,
  nodeId:'field-packet-proof-node',
  host:'127.0.0.1',
  port:0,
  advertiseHost:'127.0.0.1',
  allocatorToken:token,
  announce:false,
});

try{
  const capacity=await fetch(seed.endpoint+'/v1/capacity').then(r=>r.json());
  assert.equal(capacity.attestation_supported,true);
  assert.ok(/^sha256:[a-f0-9]{64}$/i.test(capacity.device_fingerprint));

  const evidence={
    schema:'evercraft.node001.field-evidence.v1',
    environment:'field',
    host_type:'physical',
    os_family:'linux',
    distribution_id:'debian',
    distribution_version:'12',
    systemd_verified:true,
    memory_gib:8,
    free_disk_gib:16,
    reboot_persistence_verified:true,
    reboot_receipt_ref:'sha256:'+'1'.repeat(64),
    offline_operation_verified:true,
    offline_receipt_ref:'sha256:'+'2'.repeat(64),
    telemetry_verified:true,
    telemetry_receipt_ref:'sha256:'+'3'.repeat(64),
    host_identifier_ref:'host-ref:proof',
    test_date:new Date().toISOString(),
    operator_ref:'operator-receipt:proof',
    receipt_ref:'field-test-receipt:proof',
    device_fingerprint:capacity.device_fingerprint,
    node_id:capacity.node_id,
  };
  const fieldCandidate={
    schema:'evercraft.node001.field-evidence-candidate.v1',
    ready_for_yard_enrollment:true,
    evidence,
    evidence_digest:'sha256:'+'4'.repeat(64),
    generated_at:new Date().toISOString(),
  };
  const edgeAdmission={
    schema:'evercraft.node001.public-edge-field-candidate.v1',
    node_id:capacity.node_id,
    device_fingerprint:capacity.device_fingerprint,
    field_evidence_digest:fieldCandidate.evidence_digest,
    field_evidence_ready:true,
    public_edge_configuration_valid:true,
    base_domain:'edge.evercraft.test',
    public_port:443,
    certificate_fingerprint256:'AA:BB:CC',
    certificate_valid_from:new Date(Date.now()-60_000).toISOString(),
    certificate_valid_to:new Date(Date.now()+7*86400000).toISOString(),
    certificate_days_remaining:7,
    wildcard_hostname_match:true,
    private_key_exposed:false,
    certificate_bytes_exposed:false,
    founder_login_required:false,
    applied:true,
    runtime_advertisement_verified:true,
    capacity_receipt:{
      node_id:capacity.node_id,
      device_fingerprint:capacity.device_fingerprint,
      placement_labels:['gateway','public-edge'],
      public_edge:{ready:true,public_https:true,base_domain:'edge.evercraft.test',public_port:443},
      attestation_supported:true,
    },
    ready_for_public_edge_enrollment:true,
    external_dns_verified:false,
    public_reachability_verified:false,
    external_canary_required:true,
    observed_at:new Date().toISOString(),
    receipt_hash:'sha256:'+'5'.repeat(64),
  };

  fs.writeFileSync(
    path.join(computeRoot,'field-evidence-candidate.json'),
    JSON.stringify(fieldCandidate,null,2)+'\n',
    {mode:0o600}
  );
  fs.writeFileSync(
    path.join(computeRoot,'public-edge-admission-receipt.json'),
    JSON.stringify(edgeAdmission,null,2)+'\n',
    {mode:0o600}
  );

  const unauthorized=await fetch(seed.endpoint+'/v1/field-enrollment-packet',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:'{}',
  });
  assert.equal(unauthorized.status,401);

  const authorized=await fetch(seed.endpoint+'/v1/field-enrollment-packet',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      authorization:'Bearer '+token,
    },
    body:'{}',
  });
  assert.equal(authorized.status,200);
  const packetResponse=await authorized.json();
  assert.equal(packetResponse.ok,true);
  assert.equal(packetResponse.packet.schema,'evercraft.compute.field-enrollment-packet.v1');
  assert.equal(packetResponse.packet.node_id,capacity.node_id);
  assert.equal(packetResponse.packet.device_fingerprint,capacity.device_fingerprint);
  assert.equal(packetResponse.packet.tls_private_key_included,false);
  assert.equal(packetResponse.packet.tls_certificate_bytes_included,false);
  assert.equal(packetResponse.packet.allocator_authority_included,false);

  const serialized=JSON.stringify(packetResponse);
  assert.equal(serialized.includes(token),false);
  assert.equal(serialized.includes('PRIVATE KEY'),false);

  const yard=new YardOperator({stateDir:yardState});
  const imported=await yard.enrollFieldDeviceFromCapacity({
    capacityEndpoint:seed.endpoint,
    allocatorToken:token,
    expectedNodeId:capacity.node_id,
    expectedDeviceFingerprint:capacity.device_fingerprint,
  });
  assert.equal(imported.schema,'evercraft.yard.field-enrollment-import.v1');
  assert.equal(imported.node_id,capacity.node_id);
  assert.equal(imported.device_fingerprint,capacity.device_fingerprint);
  assert.ok(/^sha256:[a-f0-9]{64}$/i.test(imported.field_enrollment_receipt));
  assert.equal(imported.public_edge_admission_receipt,edgeAdmission.receipt_hash);
  assert.ok(imported.compute_packet_receipt);
  assert.equal(imported.allocator_authority_persisted,false);
  assert.equal(imported.tls_private_key_imported,false);
  assert.equal(imported.tls_certificate_bytes_imported,false);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.yard.field-enrollment-packet-proof.v1',
    unauthorized_packet_rejected:true,
    allocator_authenticated_packet:true,
    exact_node_identity_bound:true,
    yard_field_enrollment_imported:true,
    public_edge_admission_receipt_bound:true,
    allocator_secret_exposed:false,
    tls_private_key_exposed:false,
    tls_certificate_bytes_exposed:false,
    field_enrollment_receipt:imported.field_enrollment_receipt,
    compute_packet_receipt:imported.compute_packet_receipt,
  },null,2));
}finally{
  await seed.close();
  fs.rmSync(root,{recursive:true,force:true});
}
