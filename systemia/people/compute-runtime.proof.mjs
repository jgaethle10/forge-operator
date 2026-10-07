import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from '../yard/operator.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'people-owned-proof-'));
const computeRoot=path.join(root,'compute');
const yardState=path.join(root,'yard');
const stateRoot=path.join(computeRoot,'people-state');
const authorityFile=path.join(computeRoot,'people-authority');
const allocatorAuthority=randomBytes(32).toString('hex');
const operatorAuthority=randomBytes(32).toString('hex');

fs.mkdirSync(computeRoot,{recursive:true,mode:0o700});
fs.writeFileSync(authorityFile,operatorAuthority+'\n',{mode:0o600});

const node=await startEvercraftComputeNode({
  root:computeRoot,
  nodeId:'people-owned-proof-node',
  allocatorToken:allocatorAuthority,
});
const yard=new YardOperator({stateDir:yardState});

try{
  const deployment=await yard.deployRelease({
    deploymentId:'people-layer-proof',
    releaseRef:'1'.repeat(40),
    workloadClass:'systemia.people-layer.v1',
    capacityEndpoint:node.endpoint,
    allocatorToken:allocatorAuthority,
    input:{state_root:stateRoot,admin_token_file:authorityFile},
    rollbackTarget:'proof:people-layer-previous',
    leaseTtlMs:120000,
  });

  assert.equal(deployment.state,'ready');
  assert.equal(deployment.receipt.health_verification,'healthy');
  assert.equal(deployment.result.base44_runtime_dependency,false);
  assert.equal(deployment.result.public_route_required,true);
  assert.match(deployment.result.instance_id,/^people_/);

  const health=await fetch(deployment.result.local_url+'/health').then(r=>r.json());
  assert.equal(health.ok,true);
  assert.equal(health.service,'evercraft-people-layer');
  assert.equal(health.runtime,'Evercraft Compute');

  const ui=await fetch(deployment.result.local_url+'/people');
  assert.equal(ui.status,200);
  assert.match(await ui.text(),/Evercraft People Layer/);

  const unauthorized=await fetch(deployment.result.local_url+'/api/people/brains');
  assert.equal(unauthorized.status,401);

  const createdResponse=await fetch(deployment.result.local_url+'/api/people/brains',{
    method:'POST',
    headers:{authorization:'Bearer '+operatorAuthority,'content-type':'application/json'},
    body:JSON.stringify({display_name:'Owned Runtime Athlete',person_type:'athlete',sport_or_domain:'proof'}),
  });
  assert.equal(createdResponse.status,201);
  const created=await createdResponse.json();
  assert.equal(created.brain.ownership_model,'person_sovereign');

  const inviteResponse=await fetch(
    deployment.result.local_url+'/api/people/brains/'+encodeURIComponent(created.brain.brain_key)+'/invite',
    {method:'POST',headers:{authorization:'Bearer '+operatorAuthority,'content-type':'application/json'},body:'{}'}
  );
  assert.equal(inviteResponse.status,201);
  const invite=await inviteResponse.json();

  const inspect=await fetch(
    deployment.result.local_url+'/api/people/consent/inspect?token='+encodeURIComponent(invite.invite.raw_token)
  ).then(r=>r.json());
  assert.equal(inspect.brain.display_name,'Owned Runtime Athlete');

  const acceptedResponse=await fetch(deployment.result.local_url+'/api/people/consent/accept',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      token:invite.invite.raw_token,
      accept_ownership:true,
      accept_scopes:true,
      confirmation_text:'I ACCEPT',
    }),
  });
  assert.equal(acceptedResponse.status,200);
  const accepted=await acceptedResponse.json();
  assert.equal(accepted.brain.identity_assurance,'invite_possession');

  const state=fs.readFileSync(path.join(stateRoot,'state.json'),'utf8');
  assert.equal(state.includes(invite.invite.raw_token),false);
  assert.equal(state.includes(operatorAuthority),false);
  assert.equal(state.includes(allocatorAuthority),false);

  const stopped=await yard.stopDeployment('people-layer-proof',{reason:'proof_complete'});
  assert.equal(stopped.state,'stopped');

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.people.compute-runtime-proof.v1',
    runtime:'Evercraft Compute',
    yard_deployment:true,
    private_state_root:true,
    operator_authority_file_mode_0600:true,
    person_consent_flow:true,
    authority_persisted:false,
    base44_runtime_required:false,
  },null,2));
}finally{
  try{await node.close();}catch{}
  fs.rmSync(root,{recursive:true,force:true});
}
