import test from 'node:test';
import assert from 'node:assert/strict';
import { planAuthorizedContainment } from './response-policy.mjs';
const base = () => ({
  schema:'evercraft.defense.synthetic-drill.v1',synthetic:true,
  incident_id:'spider-drill-001',mission_id:'evercraft-agent-continuity-fabric-20261016',agent_id:'spider-demo-worker',
  scope:{owner:'Evercraft',operator_authorized:true,resource_id:'synthetic-worker'},
  signals:[
    {kind:'invalid_spawn_lease',truth_state:'OBSERVED',source_family:'lease-audit',source_ref:'synthetic:lease-01'},
    {kind:'unexpected_retry_growth',truth_state:'CORROBORATED',source_family:'queue-audit',source_ref:'synthetic:queue-01'},
  ], network:{partitioned:true},break_glass:{approval_declared:false,issuer:'none'}
});
test('proposes only, never performs containment or a kill',()=>{
 const r=planAuthorizedContainment(base());
 assert.equal(r.threat_state,'SUSPECTED_BOUNDARY_CROSSING');
 assert.equal(r.execution_authority,'NONE_READ_ONLY');
 assert.equal(r.destructive_eradication_authorized,false);
 assert.equal(r.live_response_executed,false);
 assert.equal(r.external_network_pursuit_authorized,false);
});
test('two reports from one source family do not create independent corroboration',()=>{
 const x=base();x.signals[1].source_family='lease-audit';
 assert.equal(planAuthorizedContainment(x).threat_state,'WATCH_AND_CORROBORATE');
});
test('inferred evidence alone cannot trigger high concern',()=>{
 const x=base();x.signals.forEach(s=>s.truth_state='INFERRED');
 assert.equal(planAuthorizedContainment(x).threat_state,'WATCH_AND_CORROBORATE');
});
test('cross-tenant or unowned targets remain out of scope',()=>{
 const x=base();x.scope.owner='AnotherOrganization';
 const r=planAuthorizedContainment(x);
 assert.equal(r.threat_state,'OUT_OF_SCOPE');
 assert.equal(r.external_network_pursuit_authorized,false);
});
test('even a declared human grant needs external cryptographic verification',()=>{
 const x=base();x.break_glass={approval_declared:true,issuer:'independent-human-control-plane'};
 const r=planAuthorizedContainment(x);
 assert.equal(r.independent_shutdown_gate,'DECLARED_APPROVAL_REQUIRES_EXTERNAL_SIGNATURE_VALIDATION');
 assert.equal(r.destructive_eradication_authorized,false);
});
test('partitioned Network never claims universal uninterrupted access',()=>{
 const r=planAuthorizedContainment(base());
 assert.match(r.network_continuity,/IF_LOCAL_POWER_AND_STORAGE_SURVIVE/);
 const x=base();x.network.partitioned=false;
 assert.equal(planAuthorizedContainment(x).network_continuity,'END_TO_END_TRANSPORT_UNVERIFIED');
});
test('rejects unsupported unknown input and unsourced evidence',()=>{
 const x=base();x.synthetic=false;
 assert.throws(()=>planAuthorizedContainment(x),/Only synthetic/);
 const y=base();y.signals[0].source_ref='';
 assert.throws(()=>planAuthorizedContainment(y),/Invalid signal/);
});
