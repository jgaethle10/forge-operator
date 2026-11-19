import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EvercraftPassport} from '../passport/passport.mjs';
import {candidateForVerifiedWingReceipt,offerVerifiedWingReceiptToSystemia} from './intake-bridge.mjs';
const receipt=()=>({schema:'evercraft.systemia.wing-receive-receipt.v1',state:'AUTHENTICATED_BYTES_RECEIVED',
 id:'f'.repeat(32),fromWing:'harbor',toWing:'fallen',kind:'media',
 ciphertextSha256:'a'.repeat(64),receivedAt:'2026-11-19T22:20:00.000Z',
 assets:[{filename:'picture.jpg',bytes:100,sha256:'b'.repeat(64)}],
 authority:{execution:false,production:false,payment:false,customerDelivery:false,publication:false}});
test('wing package remains inert customer-origin candidate; filename and hashes stay in private source reference',()=>{
 const c=candidateForVerifiedWingReceipt({receipt:receipt()});
 assert.equal(c.source_type,'agent');
 assert.equal(c.source_trust_state,'authenticated_external');
 assert.equal(c.attachments.length,1);
 assert.equal(c.attachments[0].bytes_stored_in_intake,undefined);
 assert.equal(c.attachments[0].content_sha256,'sha256:'+'b'.repeat(64));
 assert.match(c.content_ref,/wing-courier:fallen/);
 assert.doesNotMatch(c.intent_excerpt,/Ricky|guacamole|Exotic/);
});
test('forged status is not admissible',()=>{
 const r=receipt();r.state='READY_TO_SEND_CUSTOMER';
 assert.throws(()=>candidateForVerifiedWingReceipt({receipt:r}),/unverified_or_malformed_receipt/);
});
test('Passport grant is required for even inert candidate intake, then accepted with NO execution',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wing-intake-'));fs.chmodSync(root,0o700);
 try{
  const passportStateDir=path.join(root,'passport'),intakeStateDir=path.join(root,'intake');
  const args={receipt:receipt(),passportStateDir,intakeStateDir};
  assert.throws(()=>offerVerifiedWingReceiptToSystemia(args),/intake_adapter_not_authorized/);
  const passport=new EvercraftPassport({stateDir:passportStateDir});
  passport.issueGrant({
   grant_id:'wing_courier_agent_grant',
   idempotency_key:'passport:wing-courier-agent',
   subject_ref:'adapter:wing-courier',
   issuer_ref:'evercraft:identity-authority',
   product:'evercraft-intake',scopes:['intake.write.agent'],
   starts_at:'2026-11-01T00:00:00Z',ends_at:'2027-12-31T00:00:00Z',
   authority_state:'verified_identity_authority',authority_receipt_ref:'identity:adapter:wing-courier'
  });
  const x=offerVerifiedWingReceiptToSystemia(args);
  assert.equal(x.admissionGranted,false);
  assert.equal(x.executionGranted,false);
  assert.equal(x.intakeState,'candidate_only');
  const same=offerVerifiedWingReceiptToSystemia(args);
  assert.equal(same.intakeState,'duplicate');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
