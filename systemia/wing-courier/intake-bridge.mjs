// Gateway from verified Wing Courier custody into the EXISTING Systemia Intake Fabric.
// The verified files themselves stay private at the destination; this emits inert metadata only.
import path from 'node:path';
import crypto from 'node:crypto';
import {EvercraftIntakeFabric} from '../intake-fabric/intake.mjs';
const ID=/^[a-f0-9]{32}$/,HEX=/^[a-f0-9]{64}$/i,WING=/^[a-z][a-z0-9-]{1,47}$/;
function fail(s){throw Error('wing_intake_'+s)}
const mime=s=>({'jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png','webp':'image/webp','mp4':'video/mp4',
 'mov':'video/quicktime','pdf':'application/pdf','json':'application/json','txt':'text/plain'}[path.extname(s).slice(1).toLowerCase()]||'application/octet-stream');
export function candidateForVerifiedWingReceipt({receipt,adapterActorRef='adapter:wing-courier'}={}){
 if(receipt?.schema!=='evercraft.systemia.wing-receive-receipt.v1'||
 receipt?.state!=='AUTHENTICATED_BYTES_RECEIVED'||
 !ID.test(receipt.id||'')||!WING.test(receipt.fromWing||'')||
 !WING.test(receipt.toWing||'')||!HEX.test(receipt.ciphertextSha256||'')||
 !Array.isArray(receipt.assets)||receipt.assets.length<1||receipt.assets.length>100)
  fail('unverified_or_malformed_receipt');
 const attachments=receipt.assets.map(a=>{
  if(typeof a?.filename!=='string'||!a.filename||!HEX.test(a.sha256||'')||
   !Number.isSafeInteger(a.bytes)||a.bytes<1)fail('attachment_invalid');
  return {name:a.filename,mime_type:mime(a.filename),
   content_ref:'wing-courier:'+receipt.toWing+':'+receipt.id+':'+encodeURIComponent(a.filename),
   content_sha256:'sha256:'+a.sha256,byte_size:a.bytes};
 });
 const fingerprint='sha256:'+crypto.createHash('sha256').update(JSON.stringify({
  id:receipt.id,from:receipt.fromWing,to:receipt.toWing,
  ciphertextSha256:receipt.ciphertextSha256,attachments:attachments.map(a=>[a.content_ref,a.content_sha256,a.byte_size])
 })).digest('hex');
 return {
  idempotency_key:'wing-courier:ingest:'+receipt.id,
  adapter_actor_ref:adapterActorRef,source_type:'agent',
  source_ref:'wing-courier:'+receipt.fromWing,
  external_event_id:'wing-courier:'+receipt.id,
  source_trust_state:'authenticated_external',
  claimed_source_identity_ref:'wing:'+receipt.fromWing,
  content_ref:'wing-courier:'+receipt.toWing+':'+receipt.id+':receipt',
  content_fingerprint:fingerprint,
  intent_excerpt:'Private wing work package from '+receipt.fromWing+' to '+receipt.toWing+
   '. Verified byte custody only; admission and production authority remain separate.',
  requested_capability_hints:['private-wing-handoff',receipt.toWing],
  claimed_priority:'normal',
  attachments,
  received_at:receipt.receivedAt
 };
}
export function offerVerifiedWingReceiptToSystemia({receipt,intakeStateDir,passportStateDir,adapterActorRef}={}){
 if(!intakeStateDir||!passportStateDir)fail('private_intake_and_passport_state_required');
 const candidate=candidateForVerifiedWingReceipt({receipt,adapterActorRef});
 const intake=new EvercraftIntakeFabric({stateDir:intakeStateDir,passportStateDir});
 const result=intake.ingest(candidate); // Passport must authorize intake.write.agent for adapterActorRef
 return {
  schema:'evercraft.wing-courier.intake-handoff.v1',
  packageId:receipt.id,
  intakeState:result.state,
  candidateId:result.candidate?.candidate_id||null,
  intakeReceiptHash:result.receipt?.receipt_hash||null,
  admissionGranted:false,executionGranted:false,customerDeliveryGranted:false
 };
}
