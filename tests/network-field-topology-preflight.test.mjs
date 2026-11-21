import test from 'node:test';
import assert from 'node:assert/strict';
import {isPrivateV4,assessTopology} from '../systemia/network/field-topology-preflight.mjs';

const interfaces = {
  lo:[{family:'IPv4',address:'127.0.0.1',internal:true}],
  eth0:[{family:'IPv4',address:'192.168.50.12',internal:false}],
  veth0:[{family:'IPv4',address:'172.17.0.2',internal:false}]
};

test('local NIC candidate is not called a witnessed physical node or internet outage',()=>{
  assert.equal(isPrivateV4('192.168.50.12'),true);
  assert.equal(isPrivateV4('172.16.0.1'),true);
  assert.equal(isPrivateV4('172.32.0.1'),false);
  assert.equal(isPrivateV4('192.168.50.999'),false);
  assert.equal(isPrivateV4('10.0.0.999'),false);
  assert.equal(isPrivateV4('8.8.8.8'),false);
  const r=assessTopology({interfaces,bind:'192.168.50.12',virtualization:false});
  assert.equal(r.state,'LOCAL_BIND_CANDIDATE');
  assert.equal(r.local_bind_matches_assigned_interface,true);
  assert.equal(r.hardware_peer_verified,false);
  assert.equal(r.upstream_internet_disconnected_verified,false);
  assert.equal(r.packets_sent,0);
  assert.equal(JSON.stringify(r).includes('192.168.50.12'),false);
  assert.equal(JSON.stringify(r).includes('eth0'),false);
});

test('fail-closed on loopback, unassigned IP, and guest NAT uncertainty',()=>{
  assert.equal(assessTopology({interfaces,bind:'127.0.0.1'}).state,'HOLD_LOOPBACK_ONLY');
  assert.equal(assessTopology({interfaces,bind:'192.168.50.13'}).state,'HOLD_BIND_NOT_ASSIGNED_PRIVATE_IPV4');
  assert.equal(assessTopology({interfaces,bind:'8.8.8.8'}).state,'HOLD_BIND_NOT_ASSIGNED_PRIVATE_IPV4');
  assert.equal(assessTopology({interfaces}).state,'HOLD_BIND_REQUIRED');
  const guest=assessTopology({interfaces,bind:'192.168.50.12',virtualization:true});
  assert.equal(guest.state,'REVIEW_VIRTUAL_GUEST_REACHABILITY');
  assert.equal(guest.hardware_peer_verified,false);
});
