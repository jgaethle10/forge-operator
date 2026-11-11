import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EvercraftPassport} from '../passport/passport.mjs';
import {startEvercraftHomeServer} from '../evercraft-home/server.mjs';
import {createOneBodyStateFile,readOneBodyStore} from './one-body-store.mjs';
import {emptyBodyState,ingestBodyEvent} from './one-body.mjs';

const root=await mkdtemp(path.join(os.tmpdir(),'one-body-home-http-proof-'));
const passportStateDir=path.join(root,'passport');
const identityStateDir=path.join(root,'identity');
const bodyStateFile=path.join(root,'private','one-body.json');
const trustFile=path.join(root,'private','consumer-keys.json');
const claimCode='operator-private-claim-code-for-proof';
const password='synthetic testing credential 12345678';
let runtime;
try {
  const created=ingestBodyEvent(emptyBodyState(),{
    id:'internal-sensitive-event-987654',
    product:'Evercraft Clip',
    source_ref:'private-source-ref-123',
    source:'test-source',
    kind:'health_check',
    work_required:true,
    created_at:new Date(Date.now()-45000).toISOString(),
  }).state;
  await createOneBodyStateFile(bodyStateFile,created);
  await writeFile(trustFile,JSON.stringify({}),{mode:0o600});

  runtime=await startEvercraftHomeServer({
    port:0,authMode:'passport',
    identitySecret:'home-test-signing-key-012345678901234567890',
    identityStateDir,passportStateDir,
    credentialStateDir:path.join(root,'credentials'),
    cookieSecure:false,
    ownerClaimSha256:createHash('sha256').update(claimCode).digest('hex'),
    ownerSubjectRef:'user:one-body-home-proof',
    ownerLogin:'operator',
    ownerDisplayName:'Operator',
    oneBodyStateFile:bodyStateFile,oneBodyConsumerTrustFile:trustFile,
    serviceOrigins:{},
  });
  const endpoint=runtime.url+'/api/systemia/one-body/snapshot';
  let response=await fetch(endpoint);
  assert.equal(response.status,401,'must deny unauthenticated read');
  assert.equal((await response.json()).state,'not_authorized');
  response=await fetch(endpoint,{method:'POST'});
  assert.equal(response.status,405,'read endpoint must forbid writes');
  response=await fetch(endpoint,{headers:{origin:'https://other.example'}});
  assert.equal(response.status,400,'reject cross-site origins');
  assert.equal(response.headers.get('access-control-allow-origin'),null);

  response=await fetch(runtime.url+'/api/owner-claim',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({claim_code:claimCode,password})
  });
  assert.equal(response.status,201);
  response=await fetch(runtime.url+'/api/login',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({login:'operator',password})
  });
  assert.equal(response.status,200);
  const cookie=(response.headers.get('set-cookie')||'').split(';')[0];
  assert.match(cookie,/^evercraft_session=/);
  const headers={cookie};
  response=await fetch(endpoint,{headers});
  assert.equal(response.status,403,
    'Home scope alone cannot bypass the separate Context Passport scope');

  const passport=new EvercraftPassport({stateDir:passportStateDir});
  const grant=passport.issueGrant({
    idempotency_key:'one-body-home-read-proof',
    issuer_ref:'evercraft:identity-authority',
    subject_ref:'user:one-body-home-proof',
    product:'evercraft-context',
    scopes:['context.read.systemia'],
    resource_refs:['systemia:one-body'],
    starts_at:new Date(Date.now()-360000).toISOString(),
    ends_at:new Date(Date.now()+360000).toISOString(),
    authority_state:'verified_identity_authority',
    authority_receipt_ref:'synthetic-scoped-identity-proof',
  });
  assert.equal(grant.state,'granted');
  const revision=(await readOneBodyStore(bodyStateFile)).revision;
  response=await fetch(endpoint,{headers});
  assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control')||'',/no-store/);
  assert.equal(response.headers.get('access-control-allow-origin'),null);
  const visible=await response.json();
  assert.equal(visible.schema,'evercraft.one-body.home-snapshot.v1');
  assert.equal(visible.ok,true);
  assert.equal(visible.snapshot.schema,'evercraft.systemia.visual-snapshot.v1');
  assert.equal(visible.snapshot.summary.verified_runtime_health,false);
  assert.equal(visible.execution_authority_granted,false);
  assert.equal(visible.snapshot.summary.counts.consumer_receipt_verified,0);
  assert.ok(visible.snapshot.nodes.length>1);
  assert.equal((await readOneBodyStore(bodyStateFile)).revision,revision);
  assert.ok(!JSON.stringify(visible).includes('private-source-ref-123'));
  assert.ok(!JSON.stringify(visible).includes('internal-sensitive-event-987654'));
  response=await fetch(endpoint+'?subject_ref=user:one-body-home-proof',{headers});
  assert.equal(response.status,400,'query strings must not impersonate identity');
  response=await fetch(endpoint,{headers:{...headers,'sec-fetch-site':'cross-site'}});
  assert.equal(response.status,400);

  passport.revokeGrant({
    idempotency_key:'one-body-home-revoke-proof',
    grant_id:grant.grant.grant_id,
    actor_ref:'user:one-body-home-proof',
    authority_state:'subject_self_revocation',
    authority_receipt_ref:'synthetic-revocation-proof',
    revoked_at:new Date(Date.now()-1000).toISOString(),
  });
  response=await fetch(endpoint,{headers});
  assert.equal(response.status,403,'revocation must apply on the next request');
  assert.equal((await response.json()).state,'not_authorized');
  console.log(JSON.stringify({
    ok:true,schema:'evercraft.one-body.home-http-proof.v1',
    checks:[
      'Home Identity verified session is required',
      'write methods forbidden and cross-origin requests rejected',
      'Home Passport grant does not replace Context Passport scope',
      'explicit scoped Context Passport grant enables redacted snapshot',
      'no CORS or cacheable private content',
      'no payment, execution or runtime-health claim',
      'no private event identifiers or source references',
      'grant revocation takes effect on the next HTTP read',
    ],
  },null,2));
} finally {
  if(runtime) await runtime.close();
  await rm(root,{recursive:true,force:true});
}
