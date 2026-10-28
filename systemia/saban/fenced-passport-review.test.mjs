import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EvercraftPassport} from '../passport/passport.mjs';
import {SabanFencedAckJournal} from './fenced-ack-journal.mjs';
import {fingerprintFencedRetry,makePassportRetryAuthorizer} from './fenced-passport-review.mjs';

const tmp=[];
test.after(()=>tmp.forEach(dir=>fs.rmSync(dir,{recursive:true,force:true})));
const digest='sha256:'+'a'.repeat(64);
const t=Date.parse('2026-10-28T19:00:00.000Z');
function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-passport-bound-review-'));
  tmp.push(root);
  const passportStateDir=path.join(root,'passport');
  const j=new SabanFencedAckJournal({
    stateDir:path.join(root,'jobs'),
    integritySecret:'local-fixture-ack-key',
    maxAttempts:3,
    reviewAuthorizer:makePassportRetryAuthorizer({passportStateDir})
  });
  const p=new EvercraftPassport({stateDir:passportStateDir});
  return {j,p,root};
}
function start(j,jobKey='sample:job') {
  j.submit({jobKey,workloadClass:'saban.readonly.source-check',
    workDigest:digest,now:t});
  return j.acquire({jobKey,workerId:'local-test',leaseMs:1000,now:t+100});
}
function issue(p,jobKey,attemptNumber,evidenceRef,{subject='reviewer-fixture',ttl=300,tag='a'}={}) {
  const granted=p.issueGrant({
    idempotency_key:'grant-'+tag,subject_ref:subject,issuer_ref:'fixture-root',
    authority_state:'manual_authorized',authority_receipt_ref:'fixture-only-not-live',
    product:'saban',scopes:['job.retry.review'],resource_refs:[jobKey],
    starts_at:new Date(t-1000).toISOString(),
    ends_at:new Date(t+1200000).toISOString()
  });
  const fingerprint=fingerprintFencedRetry({
    jobKey,workDigest:digest,attemptNumber,evidenceRef
  });
  const minted=p.mintActionPermit({
    idempotency_key:'permit-'+tag,grant_id:granted.grant.grant_id,
    actor_ref:subject,scope:'job.retry.review',resource_ref:jobKey,
    request_fingerprint:fingerprint,ttl_seconds:ttl,
    minted_at:new Date(t+150).toISOString()
  });
  return {granted,minted,permitId:minted.permit.permit_id,fingerprint,subject};
}
function consume(p,m,when=t+300) {
  return p.consumeActionPermit({
    idempotency_key:'consume-'+m.permitId,
    permit_id:m.permitId,actor_ref:m.subject,
    request_fingerprint:m.fingerprint,
    evidence_ref:'fixture:independent-inspection',
    consumed_at:new Date(when).toISOString()
  });
}
function review(j,jobKey,permitId,evidenceRef,now=t+1200) {
  return j.reviewRetry({
    jobKey,approvalRef:permitId,evidenceRef,
    authorization:{permit_id:permitId},now
  });
}

test('local Passport single-use consumed permit reopens exactly its bound ambiguous job',()=>{
  const {j,p}=fixture();
  const jobKey='source-check:one', evidence='proof:independent-no-effect';
  start(j,jobKey);
  const issued=issue(p,jobKey,1,evidence);
  assert.throws(()=>review(j,jobKey,issued.permitId,evidence),/passport_authority_denied/);
  consume(p,issued);
  const opened=review(j,jobKey,issued.permitId,evidence);
  assert.equal(opened.state,'queued');
  assert.match(opened.retry_authorization_receipt_ref,/^sha256:[a-f0-9]{64}$/);
  assert.equal(opened.automatic_replay_allowed,false);
  assert.equal(opened.systemia_execution_authorized,false);
  const reloaded=new SabanFencedAckJournal({stateDir:path.join(
    j.root),integritySecret:'local-fixture-ack-key',
    reviewAuthorizer:makePassportRetryAuthorizer({passportStateDir:p.stateDir})});
  assert.equal(reloaded.inspect({jobKey,now:t+1202}).state,'queued');
  assert.equal(reloaded.inspect({jobKey,now:t+1202}).journal_events,4);
  const retry=j.acquire({jobKey,workerId:'local-test',leaseMs:1000,now:t+1202});
  assert.equal(retry.attempts,2);
  assert.throws(()=>review(j,jobKey,issued.permitId,evidence,t+2303),/passport_authority_denied/);
});

test('bogus approval, changed evidence, wrong job and wrong attempt all fail closed',()=>{
  const {j,p}=fixture();
  const jobKey='source-check:two', evidence='proof:no-visible-effect';
  start(j,jobKey);
  const good=issue(p,jobKey,1,evidence,{tag:'b'});
  consume(p,good);
  assert.throws(()=>review(j,jobKey,'unknown-permit',evidence),/passport_authority_denied/);
  assert.throws(()=>review(j,jobKey,good.permitId,'proof:other'),/passport_authority_denied/);
  const forged=issue(p,jobKey,2,evidence,{tag:'c'});
  consume(p,forged);
  assert.throws(()=>review(j,jobKey,forged.permitId,evidence),/passport_authority_denied/);
  const other=issue(p,'source-check:other',1,evidence,{tag:'d'});
  consume(p,other);
  assert.throws(()=>review(j,jobKey,other.permitId,evidence),/passport_authority_denied/);
  assert.equal(j.inspect({jobKey,now:t+1300}).state,'ambiguous_expired');
});

test('revoked grant and expired permit remain denied even when previously consumed',()=>{
  const {j,p}=fixture();
  const jobKey='source-check:three',evidence='proof:reviewed';
  start(j,jobKey);
  const a=issue(p,jobKey,1,evidence,{tag:'revoked'});
  consume(p,a);
  p.revokeGrant({
    idempotency_key:'revoke-fixture',grant_id:a.granted.grant.grant_id,
    actor_ref:'fixture-root',authority_state:'manual_authorized',
    authority_receipt_ref:'fixture-revocation',
    revoked_at:new Date(t+500).toISOString()
  });
  assert.throws(()=>review(j,jobKey,a.permitId,evidence),/passport_authority_denied/);
  assert.equal(j.inspect({jobKey,now:t+1201}).state,'ambiguous_expired');

  const b=issue(p,jobKey,1,evidence,{tag:'short',ttl:1});
  consume(p,b,t+350);
  assert.throws(()=>review(j,jobKey,b.permitId,evidence,t+1300),/passport_authority_denied/);
});

test('synthetic reviewer booleans and arbitrary receipt data cannot substitute for Passport storage',()=>{
  const {j}=fixture();
  const jobKey='source-check:four';
  start(j,jobKey);
  assert.throws(()=>j.reviewRetry({
    jobKey,approvalRef:'pretend-permit',evidenceRef:'proof:claimed',
    authorization:{
      permit_id:'pretend-permit',
      consumed:true,grant_active:true,decision:'allow',
      request_fingerprint:fingerprintFencedRetry({
        jobKey,workDigest:digest,attemptNumber:1,evidenceRef:'proof:claimed'
      })
    },
    now:t+1200
  }),/passport_authority_denied/);
});
