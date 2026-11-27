#!/usr/bin/env node
// Run only against the operator's already verified temporary loopback llama-server.
// Private disposable Identity/Passport fixture, never real product permissions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {EvercraftPassport} from '../systemia/passport/passport.mjs';
import {EvercraftIdentity} from '../systemia/identity/identity.mjs';
import {startRavenInferenceGateway} from '../systemia/raven/inference-gateway.mjs';
import {runScopedSovereignProof} from '../systemia/leiland/scoped-sovereign-proof.mjs';
assert.equal(process.argv.slice(2).join(' '),'--execute-local-proof');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'leiland-local-scope-'));
let gateway;
try{
 const token=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex');
 const identityStateDir=path.join(root,'identity'),passportStateDir=path.join(root,'passport');
 new EvercraftIdentity({stateDir:identityStateDir});
 const passport=new EvercraftPassport({stateDir:passportStateDir});
 gateway=await startRavenInferenceGateway({port:0,controlToken:token,
  provider:'llama.cpp',model:'leiland-qwen3-4b',allowLocalLlamaProof:true,
  localLlamaProofOrigin:'http://127.0.0.1:18080'});
 for(const [lane,product] of [['findmypart','findmypart'],['atlas','systemia-atlas']]){
  const subject_ref='user:fixture-'+lane,now=Date.now(),until=new Date(now+300000).toISOString();
  const session={schema:'evercraft.identity.session.v1',signing_key_id:'test',subject_ref,
   display_name:'Synthetic Operator',session_id:randomUUID(),issued_at:new Date(now).toISOString(),expires_at:until};
  const encoded=Buffer.from(JSON.stringify(session)).toString('base64url');
  const sessionToken=encoded+'.'+createHmac('sha256',secret).update(encoded).digest('base64url');
  passport.issueGrant({idempotency_key:'grant:'+lane,subject_ref,issuer_ref:'evercraft:identity-authority',
   product,scopes:['leiland.synthetic-review'],resource_refs:['synthetic-leiland:'+lane],
   starts_at:new Date(now-60000).toISOString(),ends_at:until,max_delegation_depth:0,
   authority_state:'verified_identity_authority',authority_receipt_ref:'test:identity:owner'});
  const args={identityStateDir,passportStateDir,sessionKeyring:{test:secret},sessionToken,
   lane,origin:gateway.url,token,expectedProvider:'llama.cpp',allowInference:true};
  const denied=await runScopedSovereignProof({...args,lane:lane==='atlas'?'findmypart':'atlas'});
  assert.equal(denied.state,'held');assert.equal(denied.inference_request_attempted,false);
  const started=Date.now();
  const r=await runScopedSovereignProof(args);
  assert.equal(r.state,'provider_reported_completed');
  assert.equal(r.inference_completed,1);assert.equal(r.result_released,true);
  assert.equal(r.external_actions_authorized,false);assert.equal(r.receipts[0].lane,lane);
  console.log(JSON.stringify({lane,provider:'llama.cpp',model:'leiland-qwen3-4b',
   elapsed_ms:Date.now()-started,authorization_digest:r.authorization_digest,
   provider_receipt:r.receipts[0].provider_receipt,output_digest:r.receipts[0].output_digest,
   cross_product_denied:true,synthetic_identity:true,quality_reviewed:false,
   external_actions_authorized:false}));
 }
 console.log('LEILAND_004=PASS');
 console.log('SCOPED_LOCAL_GATEWAY_RESPONSES=2');
 console.log('LIVE_PERMISSIONS_CHANGED=false');
 console.log('PERSISTENT_SERVICE_CREATED=false');
}finally{
 try{if(gateway)await gateway.close()}finally{fs.rmSync(root,{recursive:true,force:true})}
}
