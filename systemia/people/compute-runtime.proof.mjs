import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { emailDestinationHash, signMailDeliveryEvidence } from './mail-delivery.mjs';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from '../yard/operator.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'people-owned-proof-'));
const computeRoot=path.join(root,'compute');
const yardState=path.join(root,'yard');
const stateRoot=path.join(computeRoot,'people-state');
const authorityFile=path.join(computeRoot,'people-authority');
const mailPublicKeyFile=path.join(computeRoot,'people-mail-public-keys.json');
const mailKeys=generateKeyPairSync('ed25519');
const allocatorAuthority=randomBytes(32).toString('hex');
const operatorAuthority=randomBytes(32).toString('hex');

fs.mkdirSync(computeRoot,{recursive:true,mode:0o700});
fs.writeFileSync(authorityFile,operatorAuthority+'\n',{mode:0o600});
fs.writeFileSync(mailPublicKeyFile,JSON.stringify({
  gmail_agent:mailKeys.publicKey.export({type:'spki',format:'pem'}),
}),{mode:0o600});

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
    input:{state_root:stateRoot,admin_token_file:authorityFile,mail_delivery_public_keys_file:mailPublicKeyFile},
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

  const challengeResponse=await fetch(
    deployment.result.local_url+'/api/people/brains/'+encodeURIComponent(created.brain.brain_key)+'/email-challenge',
    {
      method:'POST',
      headers:{authorization:'Bearer '+operatorAuthority,'content-type':'application/json'},
      body:JSON.stringify({email:'owned-runtime@example.test'}),
    }
  );
  // Without an isolated provider dispatcher, even an authorized operator
  // cannot obtain a challenge token or promote identity assurance.
  assert.equal(challengeResponse.status,503);
  const challengeBody=await challengeResponse.json();
  assert.equal(challengeBody.error,'trusted_email_dispatch_unavailable');
  assert.equal('challenge' in challengeBody,false);

  const memoryResponse=await fetch(
    deployment.result.local_url+'/api/people/brains/'+encodeURIComponent(created.brain.brain_key)+'/memories',
    {
      method:'POST',
      headers:{authorization:'Bearer '+operatorAuthority,'content-type':'application/json'},
      body:JSON.stringify({title:'Owned runtime goal',memory_type:'goal',sensitivity:'private',evidence_state:'person_stated'}),
    }
  );
  assert.equal(memoryResponse.status,201);

  const relationshipResponse=await fetch(
    deployment.result.local_url+'/api/people/brains/'+encodeURIComponent(created.brain.brain_key)+'/relationships',
    {
      method:'POST',
      headers:{authorization:'Bearer '+operatorAuthority,'content-type':'application/json'},
      body:JSON.stringify({counterpart_name:'Owned Advisor',counterpart_type:'advisor',purpose:'Career planning'}),
    }
  );
  assert.equal(relationshipResponse.status,201);
  const relationship=(await relationshipResponse.json()).relationship;
  assert.equal(relationship.access_state,'proposed');

  const grantResponse=await fetch(
    deployment.result.local_url+'/api/people/brains/'+encodeURIComponent(created.brain.brain_key)+'/relationships/'+encodeURIComponent(relationship.relationship_key)+'/grant',
    {
      method:'POST',
      headers:{authorization:'Bearer '+operatorAuthority,'content-type':'application/json'},
      body:JSON.stringify({scopes:['goals','opportunities'],person_confirmation_ref:'proof:share'}),
    }
  );
  assert.equal(grantResponse.status,200);

  const opportunityResponse=await fetch(
    deployment.result.local_url+'/api/people/brains/'+encodeURIComponent(created.brain.brain_key)+'/opportunities',
    {
      method:'POST',
      headers:{authorization:'Bearer '+operatorAuthority,'content-type':'application/json'},
      body:JSON.stringify({title:'Owned opportunity',opportunity_type:'business',summary:'Proof-only',fit_rationale:'Matches goal'}),
    }
  );
  assert.equal(opportunityResponse.status,201);
  const opportunity=(await opportunityResponse.json()).opportunity;
  assert.equal(opportunity.authority_state,'discover_only');

  const authorityResponse=await fetch(
    deployment.result.local_url+'/api/people/brains/'+encodeURIComponent(created.brain.brain_key)+'/opportunities/'+encodeURIComponent(opportunity.opportunity_key)+'/authority',
    {
      method:'POST',
      headers:{authorization:'Bearer '+operatorAuthority,'content-type':'application/json'},
      body:JSON.stringify({authority_state:'authorized',person_confirmation_ref:'proof:opportunity'}),
    }
  );
  assert.equal(authorityResponse.status,200);

  const snapshotResponse=await fetch(
    deployment.result.local_url+'/api/people/brains/'+encodeURIComponent(created.brain.brain_key),
    {headers:{authorization:'Bearer '+operatorAuthority}}
  );
  assert.equal(snapshotResponse.status,200);
  const snapshot=(await snapshotResponse.json()).snapshot;
  assert.equal(snapshot.memories.length,1);
  assert.equal(snapshot.relationships[0].access_state,'granted');
  assert.equal(snapshot.opportunities[0].authority_state,'authorized');

  const exportResponse=await fetch(
    deployment.result.local_url+'/api/people/brains/'+encodeURIComponent(created.brain.brain_key)+'/export',
    {
      method:'POST',
      headers:{authorization:'Bearer '+operatorAuthority,'content-type':'application/json'},
      body:JSON.stringify({person_confirmation_ref:'proof:export'}),
    }
  );
  assert.equal(exportResponse.status,200);
  const exported=(await exportResponse.json()).export;
  assert.equal(exported.package.memories.length,1);
  assert.equal(exported.request.request_type,'export');

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
