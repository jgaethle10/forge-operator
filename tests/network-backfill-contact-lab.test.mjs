import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {makeLabBundle,simulateAuthorizedContact,simulateDestinationDelivery,verifyBackfillAck} from '../systemia/network/backfill-contact-lab.mjs';

test('multiple synthetic authorized contact windows, durable custody and separate destination ACK',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ec-network-backfill-'));fs.chmodSync(root,0o700);
 const gateway=path.join(root,'gateway'),destination=path.join(root,'destination');
 const key=randomBytes(32),bundle=makeLabBundle({key,source:'alpha',destination:'beta',message:'synthetic interruption recovery '.repeat(110),priority:'normal',fragment_bytes:200});
 try{
  const deny=simulateAuthorizedContact({bundle,key,root:gateway,max_fragments:2,link_observed:true,identity_verified:true});
  assert.equal(deny.state,'NO_ROUTE');assert.equal(deny.ack,null);
  const first=simulateAuthorizedContact({bundle,key,root:gateway,max_fragments:2,link_observed:true,identity_verified:true,consent_ref:'operator-test-permission'});
  assert.equal(first.state,'PARTIAL');assert.equal(first.stored_fragments,2);assert.equal(first.ack,null);
  const premature=simulateDestinationDelivery({bundle,key,gateway_root:gateway,destination_root:destination,expected_destination:'beta'});
  assert.equal(premature.state,'HOLD_MISSING_FRAGMENTS');
  const second=simulateAuthorizedContact({bundle,key,root:gateway,max_fragments:2048,link_observed:true,identity_verified:true,consent_ref:'operator-test-permission'});
  assert.equal(second.state,'CUSTODY_ACCEPTED');assert.ok(second.stored_fragments>2);
  assert.equal(verifyBackfillAck({key,receipt:second.ack,bundle,expected_kind:'gateway_custody'}),true);
  assert.throws(()=>verifyBackfillAck({key,receipt:second.ack,bundle,expected_kind:'destination_delivery'}),/ack_claim_mismatch/);
  assert.throws(()=>simulateDestinationDelivery({bundle,key,gateway_root:gateway,destination_root:destination,expected_destination:'intruder'}),/destination_not_authorized/);
  const complete=simulateDestinationDelivery({bundle,key,gateway_root:gateway,destination_root:destination,expected_destination:'beta'});
  assert.equal(complete.state,'END_TO_END_DELIVERED');assert.equal(complete.duplicate,false);
  assert.equal(verifyBackfillAck({key,receipt:complete.ack,bundle,expected_kind:'destination_delivery'}),true);
  const replay=simulateDestinationDelivery({bundle,key,gateway_root:gateway,destination_root:destination,expected_destination:'beta'});
  assert.equal(replay.duplicate,true);
  assert.throws(()=>verifyBackfillAck({key,receipt:{...complete.ack,bytes_sha256:'0'.repeat(64)},bundle,expected_kind:'destination_delivery'}),/ack_claim_mismatch/);
  const altered={...bundle,manifest:{...bundle.manifest,priority:'operator_urgent'}};
  assert.throws(()=>simulateAuthorizedContact({bundle:altered,key,root:gateway,consent_ref:'yes',identity_verified:true,link_observed:true,max_fragments:1}),/unauthenticated_manifest/);
  const corrupted=path.join(gateway,bundle.manifest.bundle_id,'fragment-0.dat');fs.writeFileSync(corrupted,'bad');
  assert.throws(()=>simulateAuthorizedContact({bundle,key,root:gateway,consent_ref:'yes',identity_verified:true,link_observed:true,max_fragments:1}),/conflicting_fragment/);
  console.log(JSON.stringify({schema:'evercraft.network.backfill-contact-lab.test.v1',status:'PASS',simulation_only:true,physical_satellite_link:false,windows:2,fragments:second.fragment_count,first_window_transferred:2,second_window_transferred:second.transferred_fragments,custody_ack_separate:true,destination_ack_separate:true,corruption_rejected:true,unauthorized_route_rejected:true}));
 }finally{fs.rmSync(root,{force:true,recursive:true});}
});
