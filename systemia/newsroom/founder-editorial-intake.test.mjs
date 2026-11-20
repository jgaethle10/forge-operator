import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EvercraftPassport} from '../passport/passport.mjs';
import {stageFounderEditorialIntake,inspectFounderEditorialPickup,
 FOUNDER_INTAKE_SCHEMA,FOUNDER_PICKUP_SCHEMA} from './founder-editorial-intake.mjs';

const url='https://science.nasa.gov/missions/hubble/nasa-explores-potential-commercial-servicing-for-hubble-telescope/';
const at='2026-11-20T20:30:00Z';
const source=()=>({
 source_department:'aaar',destination:'harbor',via:'systemia',
 sensitivity:'public',mission_id:'aaar-hubble-001',
 artifact_id:'hubble-brief-001',revision:'r1',
 source_receipt_ref:'source-receipt-001',
 public_safe_summary:'Hubble future servicing is being explored, not approved.',
 review_state:'in_progress',
 claims:[
  {claim_id:'c-request',text:'NASA is inviting concepts for Hubble servicing.',
   evidence_state:'reported',source_urls:[url],uncertainty:'Request is not approval.'},
  {claim_id:'c-rescue',text:'No approved rescue is established by this request.',
   evidence_state:'reported',source_urls:[url],uncertainty:'Potential future mission.'}
 ]
});
const founder=(record=source())=>({
 schema:'evercraft.creator.personal-post-candidate.v1',
 story_id:'founder:hubble-look-closer-review-01',
 surface:'facebook-personal',format:'look-closer',
 copy:"NASA is asking private companies about ways to extend Hubble's life, but no rescue has been approved. Hubble has spent decades helping people see a universe we never understood before, and it is still worth examining the choices ahead.\n\nWhat stays with me is the work behind that telescope. Engineers and researchers kept it useful for generations, and preserving something this valuable requires real decisions about cost and risk rather than just another grand promise. I think those tradeoffs deserve more attention.",
 upstream_source:{source_department:record.source_department,mission_id:record.mission_id,
  artifact_id:record.artifact_id,revision:record.revision,source_receipt_ref:record.source_receipt_ref},
 angle:{
  why_now:'NASA opened a new window for potential servicing ideas.',
  personal_observation:'The human effort behind long-lived scientific hardware fascinates me.',
  real_tension:'Preservation must be weighed against actual risk, cost and feasibility.',
  reader_value:'Readers can distinguish agency requests from approved servicing missions.'
 },
 sources:[{id:'nasa',url,kind:'primary',checked_at:at}],
 claims:[
  {claim:'NASA is asking about potential ways to extend Hubble',
   truth_state:'attributed',source_ids:['nasa'],upstream_claim_id:'c-request',
   copy_span:"NASA is asking private companies about ways to extend Hubble's life"},
  {claim:'No rescue is approved',truth_state:'attributed',source_ids:['nasa'],
   upstream_claim_id:'c-rescue',copy_span:'no rescue has been approved'}
 ],
 media_search:{attempted:true},
 media:{usage:'link-only',url},
 publish_state:'DRAFT_NOT_PUBLISHED',
 personal_voice_owner:'FOUNDER_TO_REVIEW',autopost_authorized:false
});
function checks(r){
 const v=structuredClone(r);
 return {
  isRegisteredProducer:d=>d==='aaar',
  verifySourceReceipt:id=>id.source_receipt_ref===v.source_receipt_ref&&id.revision===v.revision,
  verifyPublicProjection:(_id,p)=>p.summary===v.public_safe_summary&&
   JSON.stringify(p.claims)===JSON.stringify(v.claims.map(c=>({...c})))
 };
}
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-intake-'));
 fs.chmodSync(dir,0o700);
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const intakeStateDir=path.join(dir,'intake'),passportStateDir=path.join(dir,'passport');
 fs.mkdirSync(intakeStateDir,{mode:0o700});fs.mkdirSync(passportStateDir,{mode:0o700});
 const actor='adapter:systemia-founder-scout',reader='adapter:harbor-editorial';
 const r=source();
 const opts={upstreamRecord:r,creatorDraft:founder(r),trustedChecks:checks(r),
  intakeStateDir,passportStateDir,adapterActorRef:actor,at};
 const passport=new EvercraftPassport({stateDir:passportStateDir});
 const grant=(subject,scope,id='grant-'+scope.replace(/\W/g,'-'))=>passport.issueGrant({
  grant_id:id,idempotency_key:'grant-idempotent-'+id,
  subject_ref:subject,issuer_ref:'evercraft:identity-authority',
  product:'evercraft-intake',scopes:[scope],
  starts_at:'2026-01-01T00:00:00Z',ends_at:'2027-01-01T00:00:00Z',
  authority_state:'verified_identity_authority',
  authority_receipt_ref:'identity:owner-authorization'
 });
 return {dir,intakeStateDir,passportStateDir,actor,reader,opts,grant};
}
test('no Passport agent grant means no intake row and no claimed Harbor delivery',t=>{
 const f=fixture(t);
 const r=stageFounderEditorialIntake(f.opts);
 assert.equal(r.schema,FOUNDER_INTAKE_SCHEMA);
 assert.equal(r.status,'HOLD');
 assert.equal(r.reason,'passport_agent_intake_write_denied');
 assert.deepEqual(fs.readdirSync(f.intakeStateDir),[]);
 assert.equal(r.harborPickupConfirmed,false);
});
test('verified source + real standards + Passport creates only inert Intake candidate',t=>{
 const f=fixture(t);f.grant(f.actor,'intake.write.agent');
 const r=stageFounderEditorialIntake(f.opts);
 assert.equal(r.status,'STAGED_IN_EXISTING_INTAKE');
 assert.match(r.intakeReceiptHash,/^sha256:[a-f0-9]{64}$/);
 assert.match(r.contentFingerprint,/^sha256:[a-f0-9]{64}$/);
 assert.equal(r.publicationAuthority,false);
 assert.equal(r.personalProfileAccess,false);
 assert.equal(r.harborPickupConfirmed,false);
 assert.equal(r.founderCopyStoredInIntake,false);
 const stored=fs.readFileSync(path.join(f.intakeStateDir,'candidates.jsonl'),'utf8');
 assert.equal(stored.trim().split('\n').length,1);
 assert.doesNotMatch(stored,/Hubble|NASA|science\.nasa|What stays with me|aaar-hubble/);
 assert.match(stored,/external_side_effects_authorized/);
 assert.equal(fs.existsSync(path.join(f.dir,'outbox')),false);
});
test('duplicate replay stays one candidate and reauthorization is mandatory',t=>{
 const f=fixture(t);f.grant(f.actor,'intake.write.agent');
 const first=stageFounderEditorialIntake(f.opts);
 const second=stageFounderEditorialIntake(f.opts);
 assert.equal(second.status,'DUPLICATE_REVIEW_CANDIDATE');
 assert.equal(second.candidateId,first.candidateId);
 assert.equal(fs.readFileSync(path.join(f.intakeStateDir,'candidates.jsonl'),'utf8').trim().split('\n').length,1);
 const expired=stageFounderEditorialIntake({...f.opts,at:'2028-01-01T00:00:00Z'});
 assert.equal(expired.reason,'passport_agent_intake_write_denied');
 assert.equal(expired.candidateId,null);
});
test('new copy or new verified source revision creates distinct record without overwriting',t=>{
 const f=fixture(t);f.grant(f.actor,'intake.write.agent');
 const first=stageFounderEditorialIntake(f.opts);
 const newCopy=structuredClone(f.opts.creatorDraft);
 newCopy.copy+="\n\nThe open questions are exactly why the story deserves another look.";
 const second=stageFounderEditorialIntake({...f.opts,creatorDraft:newCopy});
 assert.equal(second.status,'STAGED_IN_EXISTING_INTAKE');
 assert.notEqual(first.contentFingerprint,second.contentFingerprint);
 assert.notEqual(first.candidateId,second.candidateId);
 assert.equal(fs.readFileSync(path.join(f.intakeStateDir,'candidates.jsonl'),'utf8').trim().split('\n').length,2);
});
test('missing genuine upstream verifier, bad claims, or policy failure never create a row',t=>{
 const f=fixture(t);f.grant(f.actor,'intake.write.agent');
 const noVerifier=stageFounderEditorialIntake({...f.opts,trustedChecks:{}});
 assert.equal(noVerifier.reason,'source_or_canonical_editorial_preflight_held');
 const changed=structuredClone(f.opts.creatorDraft);
 changed.claims[0].truth_state='confirmed';
 assert.equal(stageFounderEditorialIntake({...f.opts,creatorDraft:changed}).status,'HOLD');
 assert.equal(stageFounderEditorialIntake({...f.opts,repoRoot:'/no-such-canonical-directory'}).status,'HOLD');
 assert.deepEqual(fs.readdirSync(f.intakeStateDir),[]);
});
test('pickup requires separate Passport read, exact ID and fingerprint and does not ACK',t=>{
 const f=fixture(t);f.grant(f.actor,'intake.write.agent');
 const staged=stageFounderEditorialIntake(f.opts);
 const pickup={candidateId:staged.candidateId,expectedContentFingerprint:staged.contentFingerprint,
  intakeStateDir:f.intakeStateDir,passportStateDir:f.passportStateDir,
  readerActorRef:f.reader,at};
 let result=inspectFounderEditorialPickup(pickup);
 assert.equal(result.status,'HOLD');
 assert.equal(result.reason,'passport_intake_read_denied_or_candidate_missing');
 f.grant(f.reader,'intake.read','grant-reader');
 result=inspectFounderEditorialPickup(pickup);
 assert.equal(result.schema,FOUNDER_PICKUP_SCHEMA);
 assert.equal(result.status,'READY_FOR_PRIVATE_HARBOR_REVIEW');
 assert.equal(result.harborPickupConfirmed,false);
 assert.equal(result.founderCopyExposed,false);
 assert.equal(result.providerPostCreated,false);
 assert.doesNotMatch(JSON.stringify(result),/NASA|science\.nasa|What stays/);
 assert.equal(inspectFounderEditorialPickup({...pickup,
  expectedContentFingerprint:'sha256:'+'f'.repeat(64)}).status,'HOLD');
});
test('wrong source type or unrelated intake candidate cannot impersonate founder review',t=>{
 const f=fixture(t);f.grant(f.actor,'intake.write.agent');f.grant(f.reader,'intake.read','grant-reader');
 const staged=stageFounderEditorialIntake(f.opts);
 const wrong=inspectFounderEditorialPickup({
  candidateId:staged.candidateId,expectedContentFingerprint:'sha256:'+'0'.repeat(64),
  intakeStateDir:f.intakeStateDir,passportStateDir:f.passportStateDir,
  readerActorRef:f.reader,at
 });
 assert.equal(wrong.reason,'candidate_exact_identity_or_safety_mismatch');
 assert.equal(wrong.personalProfileAccess,false);
});
test('private Intake and Passport dirs are required and no symlink accepted',t=>{
 const f=fixture(t);f.grant(f.actor,'intake.write.agent');
 fs.chmodSync(f.intakeStateDir,0o755);
 assert.equal(stageFounderEditorialIntake(f.opts).reason,'owner_private_runtime_not_ready');
 fs.chmodSync(f.intakeStateDir,0o700);
 const alias=path.join(f.dir,'symlink-intake');fs.symlinkSync(f.intakeStateDir,alias);
 assert.equal(stageFounderEditorialIntake({...f.opts,intakeStateDir:alias}).reason,'owner_private_runtime_not_ready');
});
test('founder personal post never gains Page, external customer, media or payment authority',t=>{
 const f=fixture(t);f.grant(f.actor,'intake.write.agent');
 const r=stageFounderEditorialIntake(f.opts);
 for(const key of ['publicationAuthority','personalProfileAccess',
  'providerPostCreated','harborPickupConfirmed','independentEditorialReviewed'])
  assert.equal(r[key],false);
 assert.equal(r.status,'STAGED_IN_EXISTING_INTAKE');
});
