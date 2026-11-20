import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePhysicalBrokerWindow}
  from '../systemia/yard/penguin-physical-broker-window.mjs';

const baseline=()=>({
  residents:{
    node_health_verified:true,
    node_port:42420,
    resident_service_count:1,
    service_identity_resolved:true,
    edge_dns_services:[{
      workload_class:'systemia.evercraft-edge-dns.v1',
      dns_tcp_port:1053,
      authoritative:true,
      recursive:false,
    }],
    broker_listeners:[],
    unclassified_tcp_listener_ports:[],
    socket_audit_error:null,
  },
  provenance:{
    known_entrypoint_invoked:true,
    all_source_blobs_match_known_history:true,
    all_source_files_predate_process_start:true,
    udp_socket_inventory_available:true,
    udp_1053_owned_by_nodeseed:true,
  },
  units:{
    nodeseed:{active:'active',enabled:'enabled'},
    broker:{active:'inactive',enabled:'disabled'},
    saban:{active:'active',enabled:'enabled'},
  },
  pendingCanaryCount:0,
});

test('exact DNS-only baseline is a read-only window, NOT physical approval',()=>{
  const result=evaluatePhysicalBrokerWindow(baseline());
  assert.equal(result.baseline_pass,true);
  assert.deepEqual(result.hold_reasons,[]);
  assert.equal(result.broker_activation_authorized,false);
  assert.equal(result.historical_broker_may_be_started,false);
  assert.equal(result.saban_dispatcher_may_be_switched,false);
  assert.equal(result.existing_authority_import_allowed,false);
  assert.equal(result.source_bytes_loaded_in_memory_verified,false);
});

test('existing broker, unclassified listener, or missing DNS refuses window',()=>{
  const modifications=[
    v=>{v.residents.broker_listeners=[{port:44444}]},
    v=>{v.residents.unclassified_tcp_listener_ports=[9876]},
    v=>{v.residents.resident_service_count=2},
    v=>{v.residents.edge_dns_services=[]},
    v=>{v.residents.edge_dns_services[0].recursive=true},
    v=>{v.residents.service_identity_resolved=false},
    v=>{v.residents.socket_audit_error='ss_unavailable'},
  ];
  for(const change of modifications){
    const v=baseline();change(v);
    const report=evaluatePhysicalBrokerWindow(v);
    assert.equal(report.baseline_pass,false);
    assert.ok(report.hold_reasons.length>0);
    assert.equal(report.broker_activation_authorized,false);
  }
});

test('changed source, lost UDP DNS, systemd drift, and old canary states refuse window',()=>{
  const modifications=[
    v=>{v.provenance.known_entrypoint_invoked=false},
    v=>{v.provenance.all_source_blobs_match_known_history=false},
    v=>{v.provenance.all_source_files_predate_process_start=false},
    v=>{v.provenance.udp_1053_owned_by_nodeseed=false},
    v=>{v.units.broker.active='active'},
    v=>{v.units.broker.enabled='enabled'},
    v=>{v.units.saban.active='inactive'},
    v=>{v.pendingCanaryCount=1},
    v=>{v.pendingCanaryCount=null},
  ];
  for(const change of modifications){
    const v=baseline();change(v);
    const report=evaluatePhysicalBrokerWindow(v);
    assert.equal(report.baseline_pass,false);
    assert.ok(report.hold_reasons.length>0);
  }
});

test('no baseline supplied never authorizes any physical action',()=>{
  const report=evaluatePhysicalBrokerWindow();
  assert.equal(report.baseline_pass,false);
  assert.ok(report.hold_reasons.length>=4);
  assert.equal(report.broker_activation_authorized,false);
});
