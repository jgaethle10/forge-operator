import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EvercraftPassport } from '../passport/passport.mjs';
import { createOneBodyStateFile } from './one-body-store.mjs';
import { emptyBodyState, ingestBodyEvent } from './one-body.mjs';
import { createOneBodySnapshotReader } from './one-body-snapshot-reader.mjs';

const root=await mkdtemp(path.join(os.tmpdir(),'systemia-onebody-reader-'));
const passportStateDir=path.join(root,'passport');
const bodyStateFile=path.join(root,'private','onebody.json');
const now=new Date();
const fromNow=ms=>new Date(now.getTime()+ms).toISOString();
const user='agent:systemia-operator-proof';
const validSession='authenticated-session-fixture';
const verifySession=async token=>token===validSession
  ?{subject_ref:user}:null;
try {
  assert.throws(()=>createOneBodySnapshotReader({
    passportStateDir,bodyStateFile
  }),/trusted_identity_verifier_required/);
  const reader=createOneBodySnapshotReader({
    passportStateDir,bodyStateFile,verifySession,clock:()=>now
  });
  const forged=await reader.read({subject_ref:user});
  assert.equal(forged.allowed,false);
  assert.equal(forged.snapshot,null);
  const missingGrant=await reader.read(validSession);
  assert.equal(missingGrant.allowed,false);
  assert.deepEqual(missingGrant,forged);
  // Denials above must not even need the private body state file to exist.
  const source=ingestBodyEvent(emptyBodyState(),{
    product:'Evercraft Clip',
    id:'redact-test',
    source_ref:'sensitive-source-reference-987',
    kind:'health_check',
    created_at:fromNow(-45000),
    title:'Synthetic monitor receipt',
    work_required:true,
  }).state;
  await createOneBodyStateFile(bodyStateFile,source);
  const passport=new EvercraftPassport({stateDir:passportStateDir});
  const wrongProduct=passport.issueGrant({
    idempotency_key:'wrong-product',
    subject_ref:user,issuer_ref:'test:identity',
    product:'evercraft-context',
    scopes:['context.read.rivet'],resource_refs:['systemia:one-body'],
    starts_at:fromNow(-3600000),ends_at:fromNow(3600000),
    authority_state:'verified_identity_authority',
    authority_receipt_ref:'identity-authority-proof',
  });
  assert.equal(wrongProduct.state,'granted');
  assert.equal((await reader.read(validSession)).allowed,false);
  const grant=passport.issueGrant({
    idempotency_key:'scoped-systemia-read',
    subject_ref:user,issuer_ref:'test:identity',
    product:'evercraft-context',
    scopes:['context.read.systemia'],resource_refs:['systemia:one-body'],
    starts_at:fromNow(-3600000),ends_at:fromNow(3600000),
    authority_state:'verified_identity_authority',
    authority_receipt_ref:'identity-authority-proof-2',
  });
  assert.equal(grant.state,'granted');
  const allowed=await reader.read(validSession);
  assert.equal(allowed.allowed,true);
  assert.equal(allowed.authority,'passport_live_read_decision');
  assert.equal(allowed.execution_authority_granted,false);
  assert.equal(allowed.snapshot.schema,'evercraft.systemia.visual-snapshot.v1');
  assert.equal(allowed.snapshot.summary.verified_runtime_health,false);
  assert.ok(allowed.snapshot.nodes.length>1);
  assert.ok(!JSON.stringify(allowed).includes('sensitive-source-reference-987'));
  assert.ok(!JSON.stringify(allowed).includes('redact-test'));

  const outOfScopeReader=createOneBodySnapshotReader({
    passportStateDir,bodyStateFile,
    verifySession:async token=>token==='attacker'?{subject_ref:'agent:other'}:null,
    clock:()=>now,
  });
  assert.equal((await outOfScopeReader.read('attacker')).allowed,false);

  passport.revokeGrant({
    idempotency_key:'revoke-systemia-reader',
    grant_id:grant.grant.grant_id,
    actor_ref:user,
    authority_state:'subject_self_revocation',
    authority_receipt_ref:'revoke-proof',
    revoked_at:fromNow(-1000),
  });
  const revoked=await reader.read(validSession);
  assert.equal(revoked.allowed,false);
  assert.deepEqual(revoked,missingGrant);
  console.log(JSON.stringify({
    ok:true,schema:'evercraft.one-body.passport-reader-proof.v1',
    checks:[
      'authenticated host verifier is mandatory',
      'caller supplied identity does not grant read access',
      'missing grant returns no metadata and never reads the state file',
      'wrong scope cannot access systemia snapshot',
      'scoped Passport grant permits only redacted graph data',
      'cross-subject access denied',
      'revocation is respected on the next read',
      'reading never grants execution or runtime health'
    ]
  },null,2));
} finally {
  await rm(root,{recursive:true,force:true});
}
