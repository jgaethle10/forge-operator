import test from 'node:test';
import assert from 'node:assert/strict';
import {
  interpretPhysicalPhase,
  sanitizePhaseResult,
} from '../systemia/yard/penguin-physical-shadow-phase-observer.mjs';

function baseline(phase='before'){
  const dns={
    ok:true,service:'evercraft-edge-dns',
    runtime:'Evercraft Compute',
    workload_class:'systemia.evercraft-edge-dns.v1',
    instance_id:'edge_dns_0123456789abcdef',
    snapshot_sha256:'sha256:'+'a'.repeat(64),
    authoritative:true,recursive:false,
    dns_tcp:true,dns_udp:true,
    dns_bind_port:1053,
    receipt_qname:'_evercraft.edge-canary.evercraftpropertyservices.com.',
  };
  const during=phase==='during';
  const broker={
    ok:true,
    schema:'evercraft.remote-capacity.broker-health.v1',
    service:'remote-capacity-broker',
    runtime:'Evercraft Compute',
    instance_id:'remote_broker_0123456789abcdef12345678',
    secure_envelope_schema:'evercraft.secure-envelope.v1',
    authorized_devices:0,
    registered_nodes:0,
    pending_enrollment_requests:0,
    deployment_receipt_bound:false,
  };
  return {
    phase,
    identity:{
      node_id:'synthetic-phase-node',
      device_fingerprint:'sha256:'+'b'.repeat(64),
    },
    inventory:{
      node_health_verified:true,node_port:42420,
      resident_service_count:during?2:1,
      service_identity_resolved:true,socket_audit_error:null,
      unclassified_tcp_listener_ports:[],
      broker_listeners:during?[{
        port:50505,
        broker:{
          broker_detected:true,
          authorized_device_count:0,
        },
      }]:[],
      owner_tcp_ports:during?
        [1053,42420,44677,50505]:[1053,42420,44677],
      edge_dns_services:[{
        service:'evercraft-edge-dns',
        workload_class:'systemia.evercraft-edge-dns.v1',
        dns_tcp_port:1053,
        health_http_port:44677,
      }],
    },
    provenance:{
      known_entrypoint_invoked:true,
      all_source_blobs_match_known_history:true,
      all_source_files_predate_process_start:true,
      udp_socket_inventory_available:true,
      udp_1053_owned_by_nodeseed:true,
    },
    healthBefore:structuredClone(dns),
    healthAfter:structuredClone(dns),
    dnsQuery:{aa:true,ra:false,rcode:0,answers:1},
    brokerHealth:during?broker:null,
    protectedUnits:{
      nodeseed:{active:'active',enabled:'enabled'},
      broker:{active:'inactive',enabled:'disabled'},
      saban:{active:'active',enabled:'enabled'},
    },
  };
}

test('source-backed DNS-only before/after capture is valid but does not invent route authority',()=>{
  for(const phase of ['before','after']){
    const result=interpretPhysicalPhase(baseline(phase));
    assert.equal(result.observed,true,JSON.stringify(result.hold_reasons));
    assert.equal(result.snapshot.resident_services,1);
    assert.equal(result.snapshot.broker,null);
    assert.equal(result.snapshot.public_route_created,null);
    assert.equal(result.snapshot.legacy_authority_imported,null);
    assert.equal(result.physical_acceptance_ready,false);
    assert.equal(result.broker_activation_authorized,false);
    const publicReport=sanitizePhaseResult(result);
    assert.equal(publicReport.observed,true);
    assert.equal(publicReport.dns_udp_authoritative,true);
    assert.equal(publicReport.raw_snapshot_printed,false);
    assert.equal(JSON.stringify(publicReport).includes('synthetic-phase-node'),false);
    assert.equal(JSON.stringify(publicReport).includes('edge_dns_'),false);
  }
});

test('future during-phase capture requires exactly one PID-owned zero-authority broker',()=>{
  const good=interpretPhysicalPhase(baseline('during'));
  assert.equal(good.observed,true,JSON.stringify(good.hold_reasons));
  assert.equal(good.snapshot.resident_services,2);
  assert.equal(good.snapshot.broker.authorized_devices,0);
  assert.equal(good.snapshot.broker.public_route_created,null);
  assert.equal(good.snapshot.broker.endpoint,'http://127.0.0.1:50505');
  assert.equal(sanitizePhaseResult(good).zero_authority_broker_seen,true);
});

test('broker authority, identity, missing listener, DNS failures and drift all fail closed',()=>{
  const changes=[
    x=>{x.brokerHealth.authorized_devices=1},
    x=>{x.brokerHealth.pending_enrollment_requests=1},
    x=>{x.brokerHealth.deployment_receipt_bound=true},
    x=>{x.brokerHealth.instance_id='unexpected'},
    x=>{x.brokerHealth=null},
    x=>{x.inventory.broker_listeners=[]},
    x=>{x.inventory.owner_tcp_ports=[1053,42420,44677]},
    x=>{x.inventory.owner_tcp_ports=null},
    x=>{x.inventory.unclassified_tcp_listener_ports=[59999]},
    x=>{x.provenance.udp_1053_owned_by_nodeseed=false},
    x=>{x.healthAfter.instance_id='edge_dns_ffffffffffffffff'},
    x=>{x.healthBefore.snapshot_sha256='sha256:'+'c'.repeat(64)},
    x=>{x.dnsQuery.aa=false},
    x=>{x.dnsQuery.ra=true},
    x=>{x.protectedUnits.broker.active='active'},
  ];
  for(const change of changes){
    const testInput=baseline('during');
    change(testInput);
    const r=interpretPhysicalPhase(testInput);
    assert.equal(r.observed,false,JSON.stringify(testInput));
    assert.equal(r.broker_activation_authorized,false);
    assert.equal(r.physical_acceptance_ready,false);
  }
});

test('DNS-only phase rejects a broker, an unexpected resident or missing source identity',()=>{
  const changes=[
    x=>{x.inventory.resident_service_count=2},
    x=>{x.inventory.broker_listeners=[{port:50505}]},
    x=>{x.brokerHealth={ok:true}},
    x=>{x.identity.device_fingerprint='bad'},
    x=>{x.provenance.all_source_files_predate_process_start=false},
    x=>{x.inventory.socket_audit_error='no_ss'},
  ];
  for(const change of changes){
    const input=baseline('before');
    change(input);
    assert.equal(interpretPhysicalPhase(input).observed,false);
  }
});

test('missing or unsupported phase evidence is HOLD, never permission to launch',()=>{
  for(const input of [undefined,{},baseline('during'),baseline('after')]){
    if(input?.phase==='during')input.phase='unsupported';
    if(input?.phase==='after')input.phase='run';
    const r=interpretPhysicalPhase(input);
    assert.equal(r.observed,false);
    assert.equal(r.broker_activation_authorized,false);
    assert.equal(r.snapshot.public_route_created,null);
  }
});
