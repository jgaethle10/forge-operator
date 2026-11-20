import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validDnsProofName,
  evaluateLiveDnsProof,
} from '../systemia/yard/penguin-edge-dns-evidence.mjs';

function observed(){
  const health={
    ok:true,
    service:'evercraft-edge-dns',
    runtime:'Evercraft Compute',
    workload_class:'systemia.evercraft-edge-dns.v1',
    instance_id:'edge_dns_0123456789abcdef',
    snapshot_sha256:'sha256:'+'a'.repeat(64),
    authoritative:true,
    recursive:false,
    dns_tcp:true,
    dns_udp:true,
    dns_bind_port:1053,
    dns_bind_host:'0.0.0.0',
    receipt_qname:'_evercraft.edge-canary.evercraftpropertyservices.com.',
  };
  return {
    inventory:{
      node_health_verified:true,
      node_port:42420,
      resident_service_count:1,
      service_identity_resolved:true,
      socket_audit_error:null,
      broker_listeners:[],
      unclassified_tcp_listener_ports:[],
      owner_tcp_ports:[1053,42420,44677],
      edge_dns_services:[{
        workload_class:'systemia.evercraft-edge-dns.v1',
        dns_tcp_port:1053,
        health_http_port:44677,
      }],
    },
    provenance:{
      udp_socket_inventory_available:true,
      udp_1053_owned_by_nodeseed:true,
      known_entrypoint_invoked:true,
      all_source_blobs_match_known_history:true,
      all_source_files_predate_process_start:true,
    },
    healthBefore:structuredClone(health),
    healthAfter:structuredClone(health),
    dnsQuery:{aa:true,ra:false,rcode:0,answers:1},
  };
}
test('read-only DNS proof requires positive authoritative UDP TXT reply and stable instance',()=>{
  const r=evaluateLiveDnsProof(observed());
  assert.equal(r.verified,true,JSON.stringify(r));
  assert.deepEqual(r.hold_reasons,[]);
  assert.equal(r.ordinary_dns_query_sent,true);
  assert.equal(r.dns_service_may_log_query,true);
  assert.equal(r.broker_activation_authorized,false);
  assert.equal(r.services_changed,false);
  assert.equal(r.qname_printed,false);
});
test('probe name validates an FQDN without printing it',()=>{
  assert.equal(validDnsProofName(
    '_EVERCRAFT.edge-canary.evercraftpropertyservices.com.'
  ),'_evercraft.edge-canary.evercraftpropertyservices.com.');
  for(const name of [
    '', 'foo.', 'bad', 'no..labels.example.', 'white space.example.',
    'x'.repeat(64)+'.zone.example.',
  ]) assert.equal(validDnsProofName(name),null);
});
test('DNS response error, recursion, empty answer or snapshot rotation fail closed',()=>{
  const edits=[
    v=>{v.dnsQuery.aa=false},
    v=>{v.dnsQuery.ra=true},
    v=>{v.dnsQuery.rcode=3},
    v=>{v.dnsQuery.answers=0},
    v=>{v.healthAfter.instance_id='edge_dns_ffffffffffffffff'},
    v=>{v.healthAfter.snapshot_sha256='sha256:'+'b'.repeat(64)},
    v=>{v.healthAfter.receipt_qname='mismatch.example.org.'},
    v=>{v.healthBefore.recursive=true},
    v=>{v.healthBefore.receipt_qname=''},
  ];
  for(const edit of edits){
    const v=observed(); edit(v);
    assert.equal(evaluateLiveDnsProof(v).verified,false);
  }
});
test('unowned TCP/UDP listener, extra resident or broker fails closed',()=>{
  const edits=[
    v=>{v.inventory.owner_tcp_ports=[42420,44677]},
    v=>{v.inventory.edge_dns_services=[]},
    v=>{v.inventory.resident_service_count=2},
    v=>{v.inventory.service_identity_resolved=false},
    v=>{v.inventory.broker_listeners=[{port:50505}]},
    v=>{v.inventory.unclassified_tcp_listener_ports=[9999]},
    v=>{v.inventory.socket_audit_error='no_access'},
    v=>{v.provenance.udp_1053_owned_by_nodeseed=false},
    v=>{v.provenance.all_source_blobs_match_known_history=false},
  ];
  for(const edit of edits){
    const v=observed();edit(v);
    const report=evaluateLiveDnsProof(v);
    assert.equal(report.verified,false);
    assert.equal(report.broker_activation_authorized,false);
  }
});
test('missing evidence is HOLD, never interpreted as proof or launch permission',()=>{
  const r=evaluateLiveDnsProof();
  assert.equal(r.verified,false);
  assert.ok(r.hold_reasons.length>0);
  assert.equal(r.broker_activation_authorized,false);
});
