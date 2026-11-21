import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {EvercraftIdentity} from '../identity/identity.mjs';
import {EvercraftPassport} from '../passport/passport.mjs';
import {liftSubjectActorId} from './identity-boundary.mjs';
import {openLiftEvidenceVaultLab} from './evidence-vault-lab.mjs';

const NOW='2026-11-15T23:00:00.000Z';
const SECRET='synthetic-lift-identity-signing-secret-long-enough-v0.4';
const CASE='lab_case_001';
const EVIDENCE='lab_evidence_test_001';
const OWN='user:fictional-lift-owner';
const REVIEW='user:fictional-lift-reviewer';
const STRANGER='user:fictional-lift-stranger';
async function makeRig(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lift-evidence-v04-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const identity=new EvercraftIdentity({stateDir:path.join(directory,'identity')});
  const passport=new EvercraftPassport({stateDir:path.join(directory,'passport')});
  const vaultDirectory=path.join(directory,'vault');
  const key=randomBytes(32);
  const subject={owner:OWN,reviewer:REVIEW,stranger:STRANGER};
  const sessions={};
  for(const [name,sub] of Object.entries(subject)){
    sessions[name]=identity.issueSession({
      schema:'evercraft.identity.authentication.v1',
      subject_ref:sub,display_name:'Fictional Lab User',auth_strength:'password',
    },{signingSecret:SECRET,signingKeyId:'primary',now:new Date(NOW),ttlSeconds:1800});
  }
  let record={
    schema:'evercraft.lift.case-workflow.v1',id:CASE,
    owner_id:liftSubjectActorId(OWN),status:'submitted',
  };
  let count=0;
  const grant=(who,scope,resource='lift:case:'+CASE)=>{
    return passport.issueGrant({
      idempotency_key:'lift-fixture-grant-'+(++count),
      issuer_ref:'system:fictional-vault-admin',
      subject_ref:subject[who],product:'evercraft-lift',scopes:['evidence.'+scope],
      ...(resource?{resource_refs:[resource]}:{}),
      authority_state:'manual_authorized',authority_receipt_ref:'fictional-grant-review',
      starts_at:'2026-11-15T22:00:00.000Z',
      ends_at:'2026-11-16T04:00:00.000Z',
    }).grant;
  };
  const open=()=>openLiftEvidenceVaultLab({
    directory:vaultDirectory,masterKey:key,identity,passport,keyring:{primary:SECRET},
    loadCase:id=>id===CASE?record:null,
  });
  const put=(vault,who='owner',extra={})=>vault.put({
    token:sessions[who].token,caseId:CASE,evidenceId:EVIDENCE,
    fixtureCode:'FICTIONAL-UTILITY-001',now:NOW,...extra,
  });
  const get=(vault,who='reviewer',extra={})=>vault.get({
    token:sessions[who].token,caseId:CASE,evidenceId:EVIDENCE,now:NOW,...extra,
  });
  const revoke=(vault,who='owner',extra={})=>vault.revoke({
    token:sessions[who].token,caseId:CASE,evidenceId:EVIDENCE,now:NOW,...extra,
  });
  return {directory,vaultDirectory,key,identity,passport,sessions,grant,open,put,get,revoke,
    setStatus:s=>{record={...record,status:s};}};
}
test('AES-GCM vault stores only ciphertext on disk and decrypts fictional fixture for permitted reviewer',async t=>{
  const r=await makeRig(t);
  r.grant('owner','write');r.grant('reviewer','read');
  const vault=await r.open();
  assert.equal((await r.put(vault)).encrypted,true);
  assert.deepEqual(await r.get(vault),{
    case_id:CASE,evidence_id:EVIDENCE,fixture_code:'FICTIONAL-UTILITY-001',fictional:true,
  });
  const files=(await fs.readdir(r.vaultDirectory)).filter(x=>x.endsWith('.json'));
  assert.equal(files.length,1);
  const text=await fs.readFile(path.join(r.vaultDirectory,files[0]),'utf8');
  assert.doesNotMatch(text,/FICTIONAL-UTILITY-001/);
  assert.doesNotMatch(text,/user:fictional-lift-owner/);
  assert.match(text,/"ciphertext"/);
  await vault.close();
});
test('default-deny: signed session is insufficient without an exact case Passport grant',async t=>{
  const r=await makeRig(t);
  r.grant('owner','write',null);
  const vault=await r.open();
  await assert.rejects(r.put(vault),/exact_case_grant_required/);
  r.grant('owner','write','lift:case:lab_case_other');
  await assert.rejects(r.put(vault),/exact_case_grant_required/);
  await vault.close();
});
test('different subject cannot upload into another owned case even if scoped',async t=>{
  const r=await makeRig(t);
  r.grant('stranger','write');
  const vault=await r.open();
  await assert.rejects(r.put(vault,'stranger'),/case_owner_required/);
  await vault.close();
});
test('unapproved reader and irrelevant case grant cannot inspect encrypted contents',async t=>{
  const r=await makeRig(t);
  r.grant('owner','write');
  const vault=await r.open();
  await r.put(vault);
  await assert.rejects(r.get(vault),/no_evidence_scope/);
  r.grant('reviewer','read','lift:case:lab_case_other');
  await assert.rejects(r.get(vault),/no_evidence_scope/);
  await vault.close();
});
test('real evidence inputs, unexpected identifiers and duplicate evidence creation are refused',async t=>{
  const r=await makeRig(t);r.grant('owner','write');
  const vault=await r.open();
  await assert.rejects(r.put(vault,'owner',{fixtureCode:'actual private bill text'}),/fictional_fixture_only/);
  await assert.rejects(r.put(vault,'owner',{evidenceId:'../../escape'}),/fictional_fixture_only|synthetic_identifier_required/);
  await r.put(vault);
  await assert.rejects(r.put(vault),/already_exists/);
  await vault.close();
});
test('authenticated encryption rejects ciphertext manipulation and wrong key',async t=>{
  const r=await makeRig(t);
  r.grant('owner','write');r.grant('reviewer','read');
  let vault=await r.open();await r.put(vault);await vault.close();
  const name=(await fs.readdir(r.vaultDirectory)).find(x=>x.endsWith('.json'));
  const file=path.join(r.vaultDirectory,name);
  const old=await fs.readFile(file,'utf8'),payload=JSON.parse(old);
  payload.ciphertext=payload.ciphertext.slice(0,-2)+'AA';
  await fs.writeFile(file,JSON.stringify(payload)+'\n',{mode:0o600});
  vault=await r.open();
  await assert.rejects(r.get(vault),/ciphertext_authentication_failed|invalid_ciphertext/);
  await vault.close();
  await fs.writeFile(file,old,{mode:0o600});
  const incorrect=await openLiftEvidenceVaultLab({
    directory:r.vaultDirectory,masterKey:randomBytes(32),
    identity:r.identity,passport:r.passport,keyring:{primary:SECRET},
    loadCase:id=>id===CASE?{schema:'evercraft.lift.case-workflow.v1',id:CASE,owner_id:liftSubjectActorId(OWN),status:'submitted'}:null,
  });
  await assert.rejects(r.get(incorrect),/ciphertext_authentication_failed/);
  await incorrect.close();
});
test('withdrawal blocks reading and owner revocation replaces ciphertext with tombstone across restart',async t=>{
  const r=await makeRig(t);
  r.grant('owner','write');r.grant('owner','revoke');r.grant('reviewer','read');
  let vault=await r.open();await r.put(vault);
  r.setStatus('withdrawn');
  await assert.rejects(r.get(vault),/case_not_readable/);
  const receipt=await r.revoke(vault);
  assert.equal(receipt.revoked,true);
  assert.equal(receipt.secure_erase_proven,false);
  await vault.close();
  const files=(await fs.readdir(r.vaultDirectory)).filter(x=>x.endsWith('.json'));
  const raw=await fs.readFile(path.join(r.vaultDirectory,files[0]),'utf8');
  assert.doesNotMatch(raw,/"ciphertext"/);
  r.setStatus('submitted');
  vault=await r.open();
  await assert.rejects(r.get(vault),/evidence_revoked/);
  await vault.close();
});
test('current Identity revocation blocks access despite still-valid Passport grant',async t=>{
  const r=await makeRig(t);
  r.grant('owner','write');
  const vault=await r.open();
  r.identity.revokeSession({sessionId:r.sessions.owner.session.session_id,subjectRef:OWN,at:NOW});
  await assert.rejects(r.put(vault),/session_revoked/);
  await vault.close();
});
test('current Passport revocation blocks further reads',async t=>{
  const r=await makeRig(t);
  r.grant('owner','write');const reader=r.grant('reviewer','read');
  const vault=await r.open();await r.put(vault);
  assert.equal((await r.get(vault)).fictional,true);
  r.passport.revokeGrant({
    grant_id:reader.grant_id,actor_ref:'system:fictional-vault-admin',
    authority_state:'manual_authorized',authority_receipt_ref:'fictional-grant-revocation',
    idempotency_key:'lift-vault-revoke-grant',revoked_at:NOW,
  });
  await assert.rejects(r.get(vault),/no_evidence_scope/);
  await vault.close();
});
test('single-writer lease blocks accidental simultaneous owners and closes safely',async t=>{
  const r=await makeRig(t);
  const one=await r.open();
  await assert.rejects(r.open(),/EEXIST/);
  await one.close();
  const two=await r.open();await two.close();
});
