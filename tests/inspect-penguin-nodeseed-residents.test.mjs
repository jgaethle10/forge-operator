import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOwnedTcpPorts,
  classifyBrokerHealth,
  classifyEdgeDnsHealth,
} from '../scripts/inspect-penguin-nodeseed-residents.mjs';

test('socket inventory keeps only listening ports owned by exact NodeSeed PID',()=>{
  const ss=[
    'LISTEN 0 511 127.0.0.1:42420 0.0.0.0:* users:(("node",pid=142,fd=10))',
    'LISTEN 0 511 0.0.0.0:18765 0.0.0.0:* users:(("node",pid=142,fd=11))',
    'LISTEN 0 511 [::1]:9876 [::]:* users:(("node",pid=143,fd=12))',
    'LISTEN 0 511 127.0.0.1:42420 0.0.0.0:* users:(("node",pid=142,fd=13))',
    'LISTEN 0 511 127.0.0.1:8765 0.0.0.0:* users:(("node",pid=1142,fd=14))',
  ].join('\n');
  assert.deepEqual(parseOwnedTcpPorts(ss,142),[18765,42420]);
  assert.deepEqual(parseOwnedTcpPorts(ss,143),[9876]);
  assert.deepEqual(parseOwnedTcpPorts(ss,144),[]);
});

test('broker identity accepts only known service schema and does not display instance ID',()=>{
  const valid={
    ok:true,
    schema:'evercraft.remote-capacity.broker-health.v1',
    service:'remote-capacity-broker',
    runtime:'Evercraft Compute',
    secure_envelope_schema:'evercraft.secure-envelope.v1',
    instance_id:'private-test-instance',
    deployment_receipt_bound:true,
    authorized_devices:0,
    registered_nodes:0,
    pending_enrollment_requests:1,
  };
  const safe=classifyBrokerHealth(valid);
  assert.equal(safe.broker_detected,true);
  assert.equal(safe.pending_enrollment_count,1);
  assert.equal(safe.deployment_receipt_bound,true);
  assert.equal('instance_id' in safe,false);
  assert.equal(JSON.stringify(safe).includes('private-test-instance'),false);
  for(const bad of [
    {...valid,service:'untrusted'},
    {...valid,schema:'untrusted.v1'},
    {...valid,secure_envelope_schema:'untrusted.v1'},
    {...valid,ok:false},
  ]) assert.equal(classifyBrokerHealth(bad),null);
});


test('Edge DNS is identified only when DNS and HTTP health listeners belong to NodeSeed',()=>{
  const health={
    ok:true,
    service:'evercraft-edge-dns',
    runtime:'Evercraft Compute',
    workload_class:'systemia.evercraft-edge-dns.v1',
    instance_id:'edge_dns_0123456789abcdef',
    authoritative:true,
    recursive:false,
    dns_udp:true,
    dns_tcp:true,
    dns_bind_port:1053,
    snapshot_sha256:'secret-snapshot-do-not-display',
    origin:'sensitive.internal.example',
  };
  const owned=[1053,42420,44677];
  const safe=classifyEdgeDnsHealth(health,owned,44677);
  assert.equal(safe.service,'evercraft-edge-dns');
  assert.equal(safe.dns_tcp_port,1053);
  assert.equal(safe.health_http_port,44677);
  assert.equal(safe.udp_confirmed_by_socket_audit,false);
  assert.equal('instance_id' in safe,false);
  assert.equal(JSON.stringify(safe).includes('secret-snapshot'),false);
  assert.equal(JSON.stringify(safe).includes('sensitive.internal'),false);
  for(const [modified,ports,httpPort] of [
    [health,[1053,42420],44677],
    [health,[42420,44677],44677],
    [{...health,dns_bind_port:9999},owned,44677],
    [{...health,recursive:true},owned,44677],
    [{...health,service:'remote-capacity-broker'},owned,44677],
    [{...health,instance_id:'fake'},owned,44677],
    [health,owned,1053],
  ]){
    assert.equal(classifyEdgeDnsHealth(modified,ports,httpPort),null);
  }
});
