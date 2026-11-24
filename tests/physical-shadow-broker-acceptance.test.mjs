import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePhysicalShadowCanaryEvidence as evaluate}
  from '../systemia/yard/physical-shadow-broker-acceptance.mjs';

function fixture(){
  const node_id='penguin-synthetic-evidence-node';
  const fingerprint='sha256:'+'a'.repeat(64);
  const units={
    nodeseed:{active:'active',enabled:'enabled'},
    broker:{active:'inactive',enabled:'disabled'},
    saban:{active:'active',enabled:'enabled'},
  };
  const make=(count,ports,broker=null)=>({
    node_id,
    device_fingerprint:fingerprint,
    node_port:42420,
    resident_services:count,
    owner_tcp_ports:ports,
    dns:{
      service:'evercraft-edge-dns',
      workload_class:'systemia.evercraft-edge-dns.v1',
      instance_id:'edge_dns_0123456789abcdef',
      snapshot_sha256:'sha256:'+'f'.repeat(64),
      dns_tcp_port:1053,
      health_http_port:44677,
      authoritative:true,recursive:false,
      dns_tcp:true,dns_udp:true,
    },
    dns_probe:{aa:true,ra:false,rcode:0,answers:1},
    protected_units:structuredClone(units),
    legacy_authority_imported:false,
    public_route_created:false,
    broker,
  });
  return {
    before:make(1,[1053,42420,44677]),
    during:make(2,[1053,42420,44677,50505],{
      service:'remote-capacity-broker',
      instance_id:'remote_broker_0123456789abcdef12345678',
      endpoint:'http://127.0.0.1:50505',
      loopback_listener_verified:true,
      authorized_devices:0,registered_nodes:0,
      pending_enrollment_requests:0,
      deployment_receipt_bound:false,
      public_route_created:false,
    }),
    after:make(1,[44677,1053,42420]),
    release:{
      ok:true,journal_phase:'released',release_receipt_verified:true,
      node_id,workload_class:'systemia.remote-capacity-broker.v1',
      secret_token_erased:true,manual_reconciliation_required:false,
    },
  };
}
test('complete DNS-safe 1 to 2 to 1 evidence passes but never authorizes another launch',()=>{
  const r=evaluate(fixture());
  assert.equal(r.accepted,true,JSON.stringify(r));
  assert.deepEqual(r.hold_reasons,[]);
  assert.equal(r.manual_reconciliation_required,false);
  assert.equal(r.broker_activation_authorized,false);
  assert.equal(r.remote_device_enrollment_authorized,false);
  assert.equal(r.saban_dispatcher_change_authorized,false);
  assert.equal(r.automatically_retry_job,false);
});

test('DNS fails closed at any of three snapshots, including identity rotation',()=>{
  const edits=[
    v=>{v.before.dns_probe.aa=false},
    v=>{v.during.dns_probe.ra=true},
    v=>{v.after.dns_probe.answers=0},
    v=>{v.during.dns.recursive=true},
    v=>{v.after.dns.instance_id='edge_dns_ffffffffffffffff'},
    v=>{v.after.dns.health_http_port=46777},
    v=>{v.during.dns_probe.rcode=2},
    v=>{v.after.owner_tcp_ports=[1053,42420]},
  ];
  for(const edit of edits){
    const v=fixture();edit(v);
    const result=evaluate(v);
    assert.equal(result.accepted,false,JSON.stringify(v));
    assert.equal(result.manual_reconciliation_required,true);
  }
});

test('resident count, unknown listener, non-loopback broker and identity drift fail',()=>{
  const edits=[
    v=>{v.before.resident_services=2},
    v=>{v.during.resident_services=1},
    v=>{v.after.resident_services=2},
    v=>{v.after.owner_tcp_ports.push(40000)},
    v=>{v.during.owner_tcp_ports=[1053,42420,44677]},
    v=>{v.during.broker.endpoint='http://192.168.1.2:50505'},
    v=>{v.during.broker.endpoint='http://127.0.0.1:42420'},
    v=>{v.after.broker=v.during.broker},
    v=>{v.during.device_fingerprint='sha256:'+'b'.repeat(64)},
    v=>{v.during.broker=null},
  ];
  for(const edit of edits){
    const v=fixture();edit(v);
    assert.equal(evaluate(v).accepted,false);
  }
});

test('nonzero remote authority, public routing or changed protected service fails',()=>{
  const edits=[
    v=>{v.during.broker.loopback_listener_verified=false},
    v=>{v.during.broker.authorized_devices=1},
    v=>{v.during.broker.registered_nodes=1},
    v=>{v.during.broker.pending_enrollment_requests=1},
    v=>{v.during.broker.deployment_receipt_bound=true},
    v=>{v.during.broker.public_route_created=true},
    v=>{v.after.public_route_created=true},
    v=>{v.before.legacy_authority_imported=true},
    v=>{v.during.protected_units.broker.active='active'},
    v=>{v.after.protected_units.saban.enabled='disabled'},
  ];
  for(const edit of edits){
    const v=fixture();edit(v);
    assert.equal(evaluate(v).accepted,false);
  }
});

test('missing, forged, unverified or uncertain release cannot be accepted',()=>{
  const edits=[
    v=>{v.release=null},
    v=>{v.release.ok=false},
    v=>{v.release.journal_phase='manual_hold'},
    v=>{v.release.release_receipt_verified=false},
    v=>{v.release.node_id='foreign-node'},
    v=>{v.release.workload_class='systemia.other.v1'},
    v=>{v.release.secret_token_erased=false},
    v=>{v.release.manual_reconciliation_required=true},
  ];
  for(const edit of edits){
    const v=fixture();edit(v);
    const r=evaluate(v);
    assert.equal(r.accepted,false);
    assert.ok(r.hold_reasons.includes(
      'broker_lease_release_not_independently_verified'));
    assert.equal(r.automatically_retry_job,false);
  }
});

test('missing observation records cannot be accepted or trigger actions',()=>{
  const r=evaluate();
  assert.equal(r.accepted,false);
  assert.equal(r.manual_reconciliation_required,true);
  assert.equal(r.broker_activation_authorized,false);
  assert.equal(r.remote_device_enrollment_authorized,false);
});


test('unchanged DNS instance but changed or missing DNS snapshot hash is HOLD',()=>{
  const edits=[
    v=>{v.before.dns.snapshot_sha256=null},
    v=>{v.during.dns.snapshot_sha256='sha256:'+'0'.repeat(64)},
    v=>{v.after.dns.snapshot_sha256='sha256:'+'1'.repeat(64)},
    v=>{v.after.dns.snapshot_sha256='malformed'},
  ];
  for(const edit of edits){
    const v=fixture();edit(v);
    const r=evaluate(v);
    assert.equal(r.accepted,false,JSON.stringify(r));
    assert.equal(r.manual_reconciliation_required,true);
    assert.equal(r.broker_activation_authorized,false);
  }
});
