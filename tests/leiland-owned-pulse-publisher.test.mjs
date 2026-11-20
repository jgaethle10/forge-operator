import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {publishOwnedKaidancePulse,verifyPublicationApproval,APPROVAL_SCHEMA} from '../systemia/leiland/owned-pulse-publisher.mjs';
import {assessPublicPulse} from '../public/kaidance/pulse-source.mjs';

const NOW=new Date('2026-11-20T03:00:00.000Z');
const iso=delta=>new Date(NOW.getTime()+delta).toISOString();
function setup(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'leiland-owned-pulse-'));
 const publicRoot=path.join(base,'public'),privateRoot=path.join(base,'private');
 const receiptDir=path.join(privateRoot,'receipts');
 const pulseDir=path.join(publicRoot,'kaidance');
 for(const dir of [publicRoot,privateRoot,receiptDir,pulseDir])fs.mkdirSync(dir,{recursive:true});
 const sourceFile=path.join(privateRoot,'safe-pulse.json');
 const approvalFile=path.join(privateRoot,'approval.json');
 const signatureFile=path.join(privateRoot,'approval.sig');
 const verifyKeyFile=path.join(privateRoot,'operator.pub.pem');
 const targetPath=path.join(pulseDir,'pulse.json');
 const key=crypto.generateKeyPairSync('ed25519');
 const safePulse={
  schema:'evercraft.kaidance.pulse.v1',state:'healthy',cycle_number:14,
  last_completed_cycle:iso(-90_000),heartbeat_target_seconds:300,
  admitted_count:7,held_count:2,coverage_receipt_valid:true,
  observed_at:iso(-60_000),field_attestation:{state:'verified'},
  unexpected_private:{customer:'SENSITIVE_SHOULD_NEVER_APPEAR'}
 };
 const approval={
  schema:APPROVAL_SCHEMA,scope:'kaidance.public-pulse.publish',
  approval_ref:'approved:leiland-test-001',
  source_path:sourceFile,target_path:targetPath,
  not_before:iso(-300_000),expires_at:iso(86400000)
 };
 const writeSafe=()=>fs.writeFileSync(sourceFile,JSON.stringify(safePulse),{mode:0o600});
 const sign=()=>{
  const bytes=Buffer.from(JSON.stringify(approval));
  fs.writeFileSync(approvalFile,bytes,{mode:0o600});
  fs.writeFileSync(signatureFile,crypto.sign(null,bytes,key.privateKey).toString('base64')+'\n',{mode:0o600});
 };
 fs.writeFileSync(verifyKeyFile,key.publicKey.export({format:'pem',type:'spki'}));
 writeSafe();sign();
 const opts={sourceFile,ownedPublicRoot:publicRoot,approvalFile,signatureFile,verifyKeyFile,receiptDir,now:NOW};
 return {base,publicRoot,privateRoot,receiptDir,sourceFile,approvalFile,signatureFile,verifyKeyFile,targetPath,safePulse,approval,key,opts,writeSafe,sign,
  cleanup:()=>fs.rmSync(base,{recursive:true,force:true})};
}
function withFixture(run){
 const f=setup();try{return run(f)}finally{f.cleanup()}
}
test('signed, current operator approval permits a narrow public KAIDANCE projection and local receipt',()=>{
 withFixture(f=>{
  const result=publishOwnedKaidancePulse(f.opts);
  assert.equal(result.state,'local_file_readback_verified_only');
  assert.equal(result.external_https_verified,false);
  assert.equal(result.source_attested,true);
  assert.equal(result.public_release_verified,false);
  assert.equal(result.cycle_number,14);
  const published=JSON.parse(fs.readFileSync(f.targetPath,'utf8'));
  assert.equal(published.schema,'evercraft.kaidance.public-pulse.v1');
  assert.equal(published.field_attestation_verified,true);
  assert.equal(assessPublicPulse(published,NOW.getTime()).verified,true);
  assert.equal(JSON.stringify(published).includes('SENSITIVE_SHOULD_NEVER_APPEAR'),false);
  assert.deepEqual(Object.keys(published).sort(),[
   'schema','state','cycle_number','last_completed_cycle','heartbeat_target_seconds','admitted_count',
   'held_count','coverage_receipt_valid','field_attestation_verified','observed_at','published_at'
  ].sort());
  const receipts=fs.readdirSync(f.receiptDir);
  assert.equal(receipts.length,1);
  assert.equal(fs.statSync(path.join(f.receiptDir,receipts[0])).mode&0o077,0);
  assert.equal(fs.readFileSync(path.join(f.receiptDir,receipts[0]),'utf8').includes('SENSITIVE'),false);
 });
});
test('tampered approval, expired approval, or substituted binding cannot publish',()=>{
 for(const mutate of [
  f=>{f.approval.scope='leiland.public.execute';fs.writeFileSync(f.approvalFile,JSON.stringify(f.approval))},
  f=>{f.approval.expires_at=iso(-1000);f.sign()},
  f=>{f.approval.target_path=path.join(f.privateRoot,'different.json');f.sign()},
 ]){
  withFixture(f=>{
   mutate(f);
   assert.throws(()=>publishOwnedKaidancePulse(f.opts),/approval_/);
   assert.equal(fs.existsSync(f.targetPath),false);
  });
 }
});
test('stale safe pulse is held, without writing green public state',()=>{
 withFixture(f=>{
  f.safePulse.observed_at=iso(-900000);f.safePulse.last_completed_cycle=iso(-920000);f.writeSafe();
  assert.throws(()=>publishOwnedKaidancePulse(f.opts),/stale/);
  assert.equal(fs.existsSync(f.targetPath),false);
 });
});
test('degraded or unverified input cannot acquire source-attested status',()=>{
 withFixture(f=>{
  f.safePulse.field_attestation={state:'not_verified'};
  f.safePulse.state='degraded';
  f.writeSafe();
  const receipt=publishOwnedKaidancePulse(f.opts);
  const pulse=JSON.parse(fs.readFileSync(f.targetPath,'utf8'));
  assert.equal(receipt.source_attested,false);
  assert.equal(assessPublicPulse(pulse,NOW.getTime()).verified,false);
 });
});
test('rejects source permissions that expose a private pulse',()=>{
 withFixture(f=>{
  fs.chmodSync(f.sourceFile,0o644);
  assert.throws(()=>publishOwnedKaidancePulse(f.opts),/private_file_permissions_invalid/);
  assert.equal(fs.existsSync(f.targetPath),false);
 });
});
test('refuses a symlink target, preventing public edge path redirection',()=>{
 withFixture(f=>{
  const decoy=path.join(f.privateRoot,'decoy.json');
  fs.writeFileSync(decoy,'NO');
  fs.symlinkSync(decoy,f.targetPath);
  assert.throws(()=>publishOwnedKaidancePulse(f.opts),/public_pulse_symlink_forbidden/);
  assert.equal(fs.readFileSync(decoy,'utf8'),'NO');
 });
});
test('approval requires exact Ed25519 signature and bounded schema',()=>{
 withFixture(f=>{
  const bytes=fs.readFileSync(f.approvalFile);
  const sig=Buffer.from(fs.readFileSync(f.signatureFile,'utf8').trim(),'base64');
  const pub=fs.readFileSync(f.verifyKeyFile,'utf8');
  assert.throws(()=>verifyPublicationApproval({
   approvalBytes:bytes,signatureBytes:Buffer.from('bad'),
   verifyKey:pub,sourcePath:f.sourceFile,targetPath:f.targetPath,now:NOW
  }),/signature/);
  assert.equal(sig.length,64);
  const approval=verifyPublicationApproval({
   approvalBytes:bytes,signatureBytes:fs.readFileSync(f.signatureFile),
   verifyKey:pub,sourcePath:f.sourceFile,targetPath:f.targetPath,now:NOW
  });
  assert.equal(approval.scope,'kaidance.public-pulse.publish');
 });
});

test('does not let a previous public cycle move backward after an authorized publication',()=>{
 withFixture(f=>{
  publishOwnedKaidancePulse(f.opts);
  f.safePulse.cycle_number=13;
  f.safePulse.last_completed_cycle=iso(-20000);
  f.safePulse.observed_at=iso(-10000);
  f.writeSafe();
  assert.throws(()=>publishOwnedKaidancePulse({...f.opts,now:new Date(NOW.getTime()+20000)}),/public_cycle_regression_forbidden/);
  const previous=JSON.parse(fs.readFileSync(f.targetPath,'utf8'));
  assert.equal(previous.cycle_number,14);
 });
});
test('does not repaint a recycled source observation as a fresh new pulse',()=>{
 withFixture(f=>{
  publishOwnedKaidancePulse(f.opts);
  assert.throws(()=>publishOwnedKaidancePulse({...f.opts,now:new Date(NOW.getTime()+20000)}),/public_observation_replay_forbidden/);
 });
});
