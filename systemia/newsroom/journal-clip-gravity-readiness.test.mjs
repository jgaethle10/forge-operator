import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { signGravityRelease } from './journal-clip-gravity-sign.mjs';
import {
  checkFacebookPageIdentityReadOnly,
  inspectGravityResident,
} from './journal-clip-gravity-readiness.mjs';

const keys=crypto.generateKeyPairSync('ed25519');
const now=new Date('2026-10-21T17:55:00.000Z');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const root=()=>fs.mkdtempSync(path.join(os.tmpdir(),'gravity-ready-'));
function unsigned(){
  const approved_copy='Evercraft Journal reports a verified infrastructure update using primary source documentation. Readers can inspect the supporting records at https://toledo.oh.gov/news/2026/10/21/hazmat-evacuation-in-north-toledo .';
  return {
    schema:'evercraft.journal.clip-gravity-release.v1',
    story_id:'journal:test:gravity:readiness',
    title:'Gravity readiness test',
    status:'approved',
    risk_class:'ordinary',
    sensitivity:{state:'public_unclassified'},
    editorial_gate:{status:'accepted',score:10},
    systemia_release:{status:'accepted',publication_authority:true,receipt_ref:'systemia:test:release',
      approved_at:'2026-10-21T17:00:00.000Z'},
    distribution_approval:{approved:true,authorization_ref:'operator:test',
      destinations:['facebook-page'],approved_at:'2026-10-21T17:05:00.000Z',copy_sha256:sha(approved_copy)},
    freshness_expires_at:'2026-10-21T23:00:00.000Z',
    claims_receipt_ref:'systemia:test:claims',
    approved_copy,
    sources:[
      {source_id:'city',url:'https://toledo.oh.gov/news/2026/10/21/hazmat-evacuation-in-north-toledo',
        evidence_state:'verified',verified_at:'2026-10-21T17:01:00.000Z'},
      {source_id:'epa',url:'https://response.epa.gov/site/site_profile.aspx?site_id=17475',
        evidence_state:'verified',verified_at:'2026-10-21T17:02:00.000Z'},
    ],
  };
}
const release=()=>signGravityRelease({release:unsigned(),privateKey:keys.privateKey,
  operatorId:'test-only-operator',keyId:'test-only-key',now});
const credentials=()=>({safe_status:{facebook:'resolved'},config:{
  pageId:'123456789012345',pageAccessToken:'secret-do-not-return',
}});
const pageResponse=(status,data)=>({ok:status>=200&&status<300,status,
  async json(){return data;}});
function args(overrides={}){
  return {
    release:release(),trustedPublicKey:keys.publicKey,now,stateRoot:root(),
    credentialResolver:credentials,checkProviderIdentity:true,
    fetchImpl:async()=>pageResponse(200,{id:'123456789012345',name:'Evercraft Journal'}),
    ...overrides,
  };
}

test('read-only Page identity verifies correct Page ID without claiming write permission',async()=>{
  let count=0;
  const checked=await checkFacebookPageIdentityReadOnly({
    pageId:'123456789012345',pageAccessToken:'top-secret',
    fetchImpl:async(url,init)=>{
      count++;
      assert.equal(init.method,'GET');
      assert.match(url,/fields=id,name/);
      assert.equal(init.headers.Authorization,'Bearer top-secret');
      return pageResponse(200,{id:'123456789012345',name:'Evercraft Journal'});
    },
  });
  assert.equal(count,1);
  assert.equal(checked.verified,true);
  assert.equal(checked.publish_permission_verified,false);
  assert.equal(JSON.stringify(checked).includes('top-secret'),false);
});

test('fully signed release, writable ledger and correct Page identity give limited readiness',async()=>{
  const receipt=await inspectGravityResident(args());
  assert.equal(receipt.state,'manual_publish_preflight_ready_write_permission_unverified');
  assert.equal(receipt.release.state,'signed_and_within_release_gates');
  assert.equal(receipt.credential.state,'resolved');
  assert.equal(receipt.facebook_page.page_name,'Evercraft Journal');
  assert.equal(receipt.provider_mutation_attempted,false);
  assert.equal(receipt.provider_published,false);
  assert.equal(receipt.facebook_page.publish_permission_verified,false);
  assert.equal(JSON.stringify(receipt).includes('secret-do-not-return'),false);
});
test('missing public key blocks a self-declared approved release',async()=>{
  const receipt=await inspectGravityResident(args({trustedPublicKey:null}));
  assert.equal(receipt.state,'blocked');
  assert.match(receipt.release.reason,/trusted_operator_key_required/);
});
test('missing provider vault never gives a green readiness signal',async()=>{
  const receipt=await inspectGravityResident(args({credentialResolver:()=>({
    safe_status:{facebook:'blocked_vault_not_configured'},config:{},
  })}));
  assert.equal(receipt.state,'blocked');
  assert.equal(receipt.credential.state,'blocked_vault_not_configured');
});
test('GET identity mismatch blocks publication readiness even for a valid token',async()=>{
  const receipt=await inspectGravityResident(args({fetchImpl:async()=>pageResponse(200,{
    id:'999999999999999',name:'Other Business Page',
  })}));
  assert.equal(receipt.state,'blocked');
  assert.equal(receipt.facebook_page.state,'provider_page_identity_mismatch');
});
test('provider denies read permission: blocked, no token or error body emitted',async()=>{
  const receipt=await inspectGravityResident(args({fetchImpl:async()=>pageResponse(403,{
    error:{message:'secret-do-not-return'},
  })}));
  assert.equal(receipt.state,'blocked');
  assert.equal(receipt.facebook_page.http_status,403);
  assert.equal(JSON.stringify(receipt).includes('secret-do-not-return'),false);
});
test('without --check-page-identity this stays blocked and makes zero requests',async()=>{
  let count=0;
  const receipt=await inspectGravityResident(args({checkProviderIdentity:false,
    fetchImpl:async()=>{count++;throw new Error('should not run');}}));
  assert.equal(count,0);
  assert.equal(receipt.state,'blocked');
  assert.equal(receipt.operator_next_action,'rerun_with_read_only_page_identity_probe');
});
test('prior durable provider claim blocks retry even if the Page is working',async()=>{
  const input=args();
  const first=await inspectGravityResident(input);
  const file=path.join(input.stateRoot,first.release.request_id+'.json');
  fs.writeFileSync(file,JSON.stringify({status:'provider_published',provider_published:true,
    provider_receipt:{remoteId:'123_456'}}),{mode:0o600});
  const second=await inspectGravityResident(input);
  assert.equal(second.state,'blocked');
  assert.equal(second.durable_claim.state,'existing_attempt_requires_reconciliation');
  assert.equal(second.durable_claim.provider_published,true);
  assert.equal(second.durable_claim.prior_remote_id,'123_456');
});
test('missing durable state root is not silently created by the read-only probe',async()=>{
  const missing=path.join(root(),'not-yet-created');
  const receipt=await inspectGravityResident(args({stateRoot:missing}));
  assert.equal(receipt.state,'blocked');
  assert.equal(receipt.durable_claim.state,'durable_root_not_created');
  assert.equal(fs.existsSync(missing),false);
});
test('malformed Page ID refuses outgoing network call',async()=>{
  let calls=0;
  const page=await checkFacebookPageIdentityReadOnly({
    pageId:'not-a-page-id',pageAccessToken:'secret',
    fetchImpl:async()=>{calls++;return pageResponse(200,{id:'1'});},
  });
  assert.equal(calls,0);
  assert.equal(page.verified,false);
});
