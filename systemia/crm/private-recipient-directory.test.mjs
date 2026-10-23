import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {resolvePrivateEmailRecipient,createPrivateEmailRecipientResolver} from './private-recipient-directory.mjs';

const now=new Date('2026-10-22T15:00:00Z');
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-private-recipient-'));
 fs.chmodSync(dir,0o700);const file=path.join(dir,'recipients.json');
 const link={subject_ref:'synthetic:person',division_id:'evercraft-home',
  channel:'email',status:'verified',identity_confirmation:true,
  mailbox:'synthetic@example.invalid',evidence_ref:'private:mailbox-verification',
  verified_at:'2026-10-20T15:00:00Z'};
 const save=links=>fs.writeFileSync(file,JSON.stringify({
  schema:'evercraft.crm.recipient-directory.v1',tenant_id:'evercraft',links
 }),{mode:0o600});
 save([link]);
 return {file,dir,link,save,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('private recipient directory resolves one verified party within one division',async()=>{
 const f=fixture();try{
  const result=resolvePrivateEmailRecipient({
   recipientDirectoryFile:f.file,subjectRef:'synthetic:person',divisionId:'evercraft-home',now
  });
  assert.equal(result.mailbox,'synthetic@example.invalid');
  const reader=createPrivateEmailRecipientResolver({recipientDirectoryFile:f.file,now});
  assert.equal((await reader({subject_ref:'synthetic:person',division_id:'evercraft-home'})).verified,true);
  assert.throws(()=>resolvePrivateEmailRecipient({
   recipientDirectoryFile:f.file,subjectRef:'synthetic:person',divisionId:'rivet',now
  }),/recipient_missing_or_ambiguous/);
 }finally{f.cleanup();}
});
test('cross-division, duplicate, unverified and stale recipient mapping all fail closed',()=>{
 const f=fixture();try{
  const read=()=>resolvePrivateEmailRecipient({recipientDirectoryFile:f.file,
   subjectRef:'synthetic:person',divisionId:'evercraft-home',now});
  f.save([f.link,{...f.link,evidence_ref:'another:source'}]);
  assert.throws(read,/ambiguous/);
  f.save([{...f.link,status:'unverified'}]);
  assert.throws(read,/recipient_not_verified/);
  f.save([{...f.link,verified_at:'2024-01-01T00:00:00Z'}]);
  assert.throws(read,/stale/);
  f.save([{...f.link}]);
  fs.chmodSync(f.file,0o644);assert.throws(read,/unsafe/);
 }finally{f.cleanup();}
});
