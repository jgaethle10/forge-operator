import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReceipt } from '../scripts/network-guardian-diagnose.mjs';

const drift = (port, internal, desc, host = '192.168.88.5') => ({
  requested: { external: port, internal, proto: 'TCP' },
  success: false, error: 'owned_mapping_drift', owner_hold: true,
  observed: { host, internal, description: desc },
});
const report = mappings => ({host:'192.168.88.3',ownership_conflict:true,
  attempts:[{method:'UPnP-IGD', mappings}]});

test('classifies verified Evercraft drift without authorizing mutation',()=>{
  const x=classifyReceipt(report([
    drift(80,18080,'Evercraft Fabric HTTP'),
    drift(443,8443,'Evercraft Fabric HTTPS')
  ]),'192.168.88.3');
  assert.equal(x.state,'OWNED_MAPPING_DRIFT');
  assert.equal(x.repair_authorized,false);
  assert.equal(x.admin_ui_required,false);
  assert.deepEqual(x.drifting.map(d=>d.external),[80,443]);
});
test('foreign description is a hard stop',()=>{
  assert.equal(classifyReceipt(report([drift(443,8443,'Other service')]),'192.168.88.3').state,'OWNERSHIP_UNVERIFIED');
});
test('changed internal port is a hard stop',()=>{
  const m=drift(443,8443,'Evercraft Fabric HTTPS');m.observed.internal=9876;
  assert.equal(classifyReceipt(report([m]),'192.168.88.3').state,'OWNERSHIP_UNVERIFIED');
});
test('stale receipt cannot authorize or validate anything',()=>{
  const x=classifyReceipt(report([]),'192.168.88.5');
  assert.equal(x.state,'STALE_RECEIPT');
  assert.equal(x.repair_authorized,false);
});
test('process success does not establish public ingress',()=>{
  const x=classifyReceipt({host:'192.168.88.3',ok:true,production_mapping_control_ok:true,
    public_ingress_verified:false,attempts:[]},'192.168.88.3');
  assert.equal(x.state,'PUBLIC_UNVERIFIED');
});
test('unverified conflict fails closed',()=>{
  assert.equal(classifyReceipt(report([]),'192.168.88.3').state,'OWNERSHIP_CONFLICT');
});
test('explicit independent public receipt is required for verified status',()=>{
  const x=classifyReceipt({host:'192.168.88.3',ok:true,public_ingress_verified:true,attempts:[]},'192.168.88.3');
  assert.equal(x.state,'PUBLIC_VERIFIED');
});
