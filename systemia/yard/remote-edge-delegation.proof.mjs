import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { startOutboundNodeAgent } from '../network/outbound-node-agent.mjs';
import { YardOperator } from './operator.mjs';

const digest=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));

const root=fs.mkdtempSync(path.join(os.tmpdir(),'remote-edge-delegation-proof-'));
const brokerRoot=path.join(root,'broker');
const remoteRoot=path.join(root,'remote');
const yardState=path.join(root,'yard');
const brokerState=path.join(brokerRoot,'services','broker');
const brokerAllocator='broker-host-allocator-secret';
const remoteAllocator='remote-field-node-real-allocator-secret';
const releaseRef='f'.repeat(40);

const brokerSeed=await startNodeSeed({
  root:brokerRoot,
  nodeId:'remote-edge-broker-host',
  host:'127.0.0.1',
  port:0,
  advertiseHost:'127.0.0.1',
  allocatorToken:brokerAllocator,
  announce:false,
});

const tlsDir=path.join(root,'tls');
fs.mkdirSync(tlsDir,{recursive:true});
const tlsKey=path.join(tlsDir,'edge.key.pem');
const tlsCert=path.join(tlsDir,'edge.cert.pem');
execFileSync('openssl',[
  'req','-x509','-newkey','rsa:2048','-nodes',
  '-keyout',tlsKey,
  '-out',tlsCert,
  '-days','10',
  '-subj','/CN=*.edge.evercraft.test',
  '-addext','subjectAltName=DNS:*.edge.evercraft.test',
],{stdio:'ignore'});

const previous={
  domain:process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN,
  key:process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH,
  cert:process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH,
  port:process.env.EVERCRAFT_PUBLIC_EDGE_PORT,
};
process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN='edge.evercraft.test';
process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH=tlsKey;
process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH=tlsCert;
process.env.EVERCRAFT_PUBLIC_EDGE_PORT='443';

const remoteSeed=await startNodeSeed({
  root:remoteRoot,
  nodeId:'remote-field-edge-node',
  host:'127.0.0.1',
  port:0,
  advertiseHost:'127.0.0.1',
  allocatorToken:remoteAllocator,
  placementLabels:['public-edge','gateway'],
  announce:false,
});

const yard=new YardOperator({stateDir:yardState});
let agent=null;

try{
  const capacity=await fetch(remoteSeed.endpoint+'/v1/capacity').then(r=>r.json());
  assert.equal(capacity.attestation_supported,true);
  assert.equal(capacity.capacity_hint.services.public_edge.ready,true);
  assert.equal(capacity.capacity_hint.services.public_edge.public_https,true);
  assert.ok(capacity.placement_labels.includes('public-edge'));
  assert.ok(capacity.placement_labels.includes('gateway'));

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
    host_identifier_ref:'host-ref:remote-proof',
    test_date:new Date().toISOString(),
    operator_ref:'operator-ref:remote-proof',
    receipt_ref:'field-receipt:remote-proof',
    device_fingerprint:capacity.device_fingerprint,
    node_id:capacity.node_id,
  };
  const fieldCandidate={
    schema:'evercraft.node001.field-evidence-candidate.v1',
    ready_for_yard_enrollment:true,
    evidence,
    evidence_digest:digest(evidence),
    generated_at:new Date().toISOString(),
  };
  const edgeBody={
    schema:'evercraft.node001.public-edge-field-candidate.v1',
    node_id:capacity.node_id,
    device_fingerprint:capacity.device_fingerprint,
    field_evidence_digest:fieldCandidate.evidence_digest,
    field_evidence_ready:true,
    public_edge_configuration_valid:true,
    base_domain:capacity.capacity_hint.services.public_edge.base_domain,
    public_port:capacity.capacity_hint.services.public_edge.public_port,
    certificate_fingerprint256:
      capacity.capacity_hint.services.public_edge.certificate_fingerprint256,
    certificate_valid_from:new Date(Date.now()-60_000).toISOString(),
    certificate_valid_to:
      capacity.capacity_hint.services.public_edge.certificate_valid_to,
    certificate_days_remaining:9,
    wildcard_hostname_match:true,
    private_key_exposed:false,
    certificate_bytes_exposed:false,
    founder_login_required:false,
    applied:true,
    runtime_advertisement_verified:true,
    capacity_receipt:{
      node_id:capacity.node_id,
      device_fingerprint:capacity.device_fingerprint,
      placement_labels:[...capacity.placement_labels].sort(),
      public_edge:{
        ready:true,
        public_https:true,
        base_domain:capacity.capacity_hint.services.public_edge.base_domain,
        public_port:capacity.capacity_hint.services.public_edge.public_port,
        certificate_fingerprint256:
          capacity.capacity_hint.services.public_edge.certificate_fingerprint256,
        certificate_valid_to:
          capacity.capacity_hint.services.public_edge.certificate_valid_to,
      },
      attestation_supported:true,
    },
    ready_for_public_edge_enrollment:true,
    external_dns_verified:false,
    public_reachability_verified:false,
    external_canary_required:true,
    observed_at:new Date().toISOString(),
  };
  const edgeAdmission={...edgeBody,receipt_hash:digest(edgeBody)};
  fs.writeFileSync(
    path.join(remoteRoot,'field-evidence-candidate.json'),
    JSON.stringify(fieldCandidate,null,2)+'\n',
    {mode:0o600}
  );
  fs.writeFileSync(
    path.join(remoteRoot,'public-edge-admission-receipt.json'),
    JSON.stringify(edgeAdmission,null,2)+'\n',
    {mode:0o600}
  );

  const broker=await yard.deployRelease({
    deploymentId:'remote-edge-broker',
    releaseRef,
    workloadClass:'systemia.remote-capacity-broker.v1',
    capacityEndpoint:brokerSeed.endpoint,
    allocatorToken:brokerAllocator,
    input:{
      state_root:brokerState,
      authorized_devices:{
        [remoteSeed.device_fingerprint]:remoteSeed.node_id,
      },
      poll_wait_ms:50,
      command_timeout_ms:5000,
      capacity_fresh_ms:1000,
    },
    rollbackTarget:'proof:broker-previous',
    leaseTtlMs:120000,
  });
  assert.equal(broker.state,'ready');

  const brokerProofRoute=await yard.verifyPublicRoute(
    'remote-edge-broker',
    {origin:broker.result.local_url,allowLoopbackProof:true}
  );
  assert.equal(brokerProofRoute.scope,'loopback_proof');

  agent=await startOutboundNodeAgent({
    brokerUrl:broker.result.local_url,
    localCapacityEndpoint:remoteSeed.endpoint,
    localAllocatorToken:remoteAllocator,
    pollBackoffMs:20,
    capacityRefreshEveryPoll:true,
  });
  await sleep(100);

  const inventory=await yard.listRemoteCapacityNodes('remote-edge-broker');
  assert.equal(inventory.count,1);
  const listed=inventory.nodes[0];
  assert.equal(listed.node_id,remoteSeed.node_id);
  assert.equal(listed.connected,true);
  assert.equal(listed.capacity.attestation_supported,true);
  assert.ok(listed.capacity.placement_labels.includes('public-edge'));
  assert.ok(listed.capacity.placement_labels.includes('gateway'));
  assert.equal(listed.capacity.public_edge.ready,true);
  assert.equal(listed.capacity.public_edge.public_https,true);
  const inventoryText=JSON.stringify(inventory);
  assert.equal(inventoryText.includes(remoteAllocator),false);
  assert.equal(inventoryText.includes('control_token'),false);

  const grant=await yard.remoteCapacityGrant(
    'remote-edge-broker',
    remoteSeed.node_id,
    {allowLoopbackProof:true}
  );
  assert.notEqual(grant.allocator_token,remoteAllocator);
  assert.ok(grant.control_grant_receipt_hash);

  const packetResponse=await fetch(
    grant.capacity_endpoint+'/v1/field-enrollment-packet',
    {
      method:'POST',
      headers:{
        'content-type':'application/json',
        authorization:'Bearer '+grant.allocator_token,
      },
      body:'{}',
    }
  );
  assert.equal(packetResponse.status,200);
  const packet=await packetResponse.json();
  assert.equal(packet.ok,true);
  assert.equal(packet.packet.node_id,remoteSeed.node_id);
  assert.equal(packet.packet.device_fingerprint,remoteSeed.device_fingerprint);
  assert.equal(JSON.stringify(packet).includes(remoteAllocator),false);

  const imported=await yard.enrollFieldDeviceFromCapacity({
    capacityEndpoint:grant.capacity_endpoint,
    allocatorToken:grant.allocator_token,
    expectedNodeId:remoteSeed.node_id,
    expectedDeviceFingerprint:remoteSeed.device_fingerprint,
  });
  assert.ok(imported.field_enrollment_receipt);
  assert.equal(
    imported.public_edge_admission_receipt,
    edgeAdmission.receipt_hash
  );

  const edge=await yard.deployRelease({
    deploymentId:'remote-proof-edge',
    releaseRef,
    workloadClass:'systemia.public-edge.v1',
    capacityEndpoint:grant.capacity_endpoint,
    allocatorToken:grant.allocator_token,
    input:{
      mode:'proof_loopback',
      control_host:'127.0.0.1',
      control_port:0,
      public_host:'127.0.0.1',
      public_port:0,
      base_domain:'',
      tls_key_path:'',
      tls_cert_path:'',
      allow_private_upstream:false,
    },
    rollbackTarget:'proof:remote-edge-previous',
    leaseTtlMs:120000,
  });
  assert.equal(edge.state,'ready');

  const specialist=await yard.deployRelease({
    deploymentId:'remote-proof-specialist',
    releaseRef,
    workloadClass:'systemia.specialist-handoff-mcp.v1',
    capacityEndpoint:grant.capacity_endpoint,
    allocatorToken:grant.allocator_token,
    input:{gateway_url:'https://example.invalid/machine-commerce'},
    rollbackTarget:'proof:remote-specialist-previous',
    leaseTtlMs:120000,
  });
  assert.equal(specialist.state,'ready');

  const [edgeAttestation,specialistAttestation]=await Promise.all([
    yard.attestDeployment('remote-proof-edge'),
    yard.attestDeployment('remote-proof-specialist'),
  ]);
  assert.equal(edgeAttestation.identity_verified,true);
  assert.equal(edgeAttestation.field_verified,true);
  assert.equal(specialistAttestation.identity_verified,true);
  assert.equal(specialistAttestation.field_verified,true);
  assert.equal(
    edgeAttestation.device_fingerprint,
    specialistAttestation.device_fingerprint
  );

  const binding=await yard.bindSpecialistIdentityAttestation(
    'remote-proof-specialist',
    {
      deviceFingerprint:edgeAttestation.device_fingerprint,
      edgeAttestationReceipt:edgeAttestation.receipt_hash,
      specialistAttestationReceipt:specialistAttestation.receipt_hash,
      fieldVerified:true,
      fieldEnrollmentReceipt:imported.field_enrollment_receipt,
      publicEdgeAdmissionReceipt:imported.public_edge_admission_receipt,
    }
  );
  assert.equal(binding.same_device_binding,true);
  assert.equal(binding.field_verified,true);

  const specialistHealth=await yard.verifyRoute('remote-proof-specialist');
  assert.equal(specialistHealth.state,'public_route_unbound');
  assert.equal(specialistHealth.local_health_ok,true);
  assert.equal(specialistHealth.health.field_verified,true);
  assert.equal(specialistHealth.health.same_device_binding,true);

  const provider=yard.publicRouteProviderClient('remote-proof-edge');
  const capabilities=await provider.capabilities();
  assert.equal(capabilities.protocol,'evercraft.public-route.v1');

  await yard.stopDeployment('remote-proof-specialist',{reason:'proof_complete'});
  await yard.stopDeployment('remote-proof-edge',{reason:'proof_complete'});
  await yard.stopDeployment('remote-edge-broker',{reason:'proof_complete'});

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.remote-edge.delegation-proof.v1',
    outbound_only_field_node:true,
    safe_capacity_inventory:true,
    derived_control_grant:true,
    original_allocator_token_exposed:false,
    field_packet_over_secure_broker:true,
    yard_field_enrollment_over_broker:true,
    remote_edge_deployment:true,
    remote_specialist_deployment:true,
    signed_identity_attestation:true,
    field_attestation_verified:true,
    same_device_binding:true,
    specialist_field_health_bound:true,
    public_route_provider_management_reachable:true,
    external_public_https_verified:false,
    proof_scope:'broker_loopback_control_plane_only',
    field_enrollment_receipt:imported.field_enrollment_receipt,
    control_grant_receipt:grant.control_grant_receipt_hash,
    specialist_binding_receipt:binding.compute_binding_receipt,
  },null,2));
}finally{
  try{await agent?.close();}catch{}
  try{await brokerSeed.close();}catch{}
  try{await remoteSeed.close();}catch{}
  if(previous.domain===undefined) delete process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN;
  else process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN=previous.domain;
  if(previous.key===undefined) delete process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH;
  else process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH=previous.key;
  if(previous.cert===undefined) delete process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH;
  else process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH=previous.cert;
  if(previous.port===undefined) delete process.env.EVERCRAFT_PUBLIC_EDGE_PORT;
  else process.env.EVERCRAFT_PUBLIC_EDGE_PORT=previous.port;
  fs.rmSync(root,{recursive:true,force:true});
}
