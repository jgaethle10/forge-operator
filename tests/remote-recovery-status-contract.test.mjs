import test from 'node:test';
import assert from 'node:assert/strict';
import {assessRemoteOperatorStatus} from '../scripts/remote-recovery-status-contract.mjs';
const candidate=()=>({
  ok:true,
  schema:'evercraft.remote-operator.status.v1',
  instance_id:'remote_operator_'+'a'.repeat(20),
  roots:['home','evercraft','state'],
  filesystem:{list:true,read:true,write:true,sensitive_path_read_block:true},
  execution:{
    mode:'bounded-program',interactive_tty:false,root_privilege:false,
    programs:['git','npm','systemctl','journalctl'],
    ambient_secret_environment_forwarded:false,
  },
});
test('checks the actual bounded, nonroot Remote Operator contract without admitting any remote node',()=>{
  const r=assessRemoteOperatorStatus(candidate());
  assert.equal(r.accepted,true);
  assert.equal(r.bounded_nonroot_verified,true);
  assert.equal(r.actual_node_identity_verified,false);
  assert.equal(r.cross_node_dispatch_verified,false);
  assert.equal(JSON.stringify(r).includes('remote_operator_'+('a'.repeat(20))),false);
});
test('a successful HTTP JSON body or a fake provider response cannot yield remote green',()=>{
  for(const c of [null,{}, {ok:true}, {...candidate(),schema:'impostor'},
    {...candidate(),ok:false},
    {...candidate(),instance_id:'someone-else'}])
    assert.equal(assessRemoteOperatorStatus(c).accepted,false);
});
test('no interactive, root, unbounded, ambient-secret or arbitrary execution slips through',()=>{
  for(const patch of [
    {root_privilege:true},{interactive_tty:true},{ambient_secret_environment_forwarded:true},
    {mode:'shell'},{programs:['bash']},{programs:['git','git']},{programs:[]},
  ]){
    const c=candidate();c.execution={...c.execution,...patch};
    assert.equal(assessRemoteOperatorStatus(c).accepted,false,JSON.stringify(patch));
  }
});
test('sensitive-path restriction and root-key admission always required',()=>{
  const values=[
    {roots:['/root']},{roots:[]},{roots:['state','state']},
    {filesystem:{sensitive_path_read_block:false}},
  ];
  for(const p of values)assert.equal(assessRemoteOperatorStatus({...candidate(),...p}).accepted,false);
});
