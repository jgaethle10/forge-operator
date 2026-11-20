import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EvercraftPassport} from '../passport/passport.mjs';
import {createAttestationPayload,signAttestation} from '../lineage/signatures.mjs';
import {lineage} from '../lineage/core.mjs';
import {
 stageOwnedFounderEditorialIntake,inspectFounderEditorialPickup,
 FOUNDER_INTAKE_SCHEMA,FOUNDER_PICKUP_SCHEMA
} from './founder-editorial-intake.mjs';
import {
 OWNER_HARBOR_FOUNDER_SCHEMA,OWNER_HARBOR_TRUST_SCHEMA
} from './harbor-founder-owner-inbox.mjs';

const url='https://science.nasa.gov/missions/hubble/nasa-explores-potential-commercial-servicing-for-hubble-telescope/';
const at='2026-11-20T20:30:00Z';
const sha=v=>crypto.createHash('sha256').update(lineage.stable(v)).digest('hex');
function signedPacket(){
 const record={
  source_department:'aaar',destination:'harbor',via:'systemia',
  sensitivity:'public',mission_id:'aaar-hubble-001',
  artifact_id:'public-hubble-brief-001',revision:'r1',
  source_receipt_ref:'aaar-signed-receipt-001',
  public_safe_summary:'A bounded request for commercial Hubble servicing concepts.',
  review_state:'in_progress',
  claims:[
   {claim_id:'c-request',text:'NASA is seeking industry concepts for Hubble servicing.',
    evidence_state:'reported',source_urls:[url],uncertainty:'A request is not a rescue approval.'},
   {claim_id:'c-approval',text:'No rescue mission approval follows automatically.',
    evidence_state:'reported',source_urls:[url],uncertainty:'A future mission is unconfirmed.'}
  ]
 };
 const creatorDraft={
  schema:'evercraft.creator.personal-post-candidate.v1',
  surface:'facebook-personal',format:'look-closer',
  story_id:'founder:hubble-source-bound-reflection',
  copy:"NASA is asking whether private teams could extend Hubble's useful life, but no rescue has been approved. The telescope has already given us decades of discoveries, and that doesn't make choosing what to do next any easier.\n\nWhat keeps me looking at this story is the people who have worked to keep an aging spacecraft useful. I want to understand the risks and economics of saving it instead of assuming that the most sentimental answer must also be the right one.",
  upstream_source:{source_department:record.source_department,mission_id:record.mission_id,
   artifact_id:record.artifact_id,revision:record.revision,source_receipt_ref:record.source_receipt_ref},
  angle:{
   why_now:'An official request for ideas has reopened a significant public debate.',
   personal_observation:'I keep thinking about the people who make long-lived machines possible.',
   real_tension:'Technical risk and cost may conflict with our wish to preserve an iconic instrument.',
   reader_value:'Readers can distinguish an invitation for servicing concepts from an approved mission.'
  },
  sources:[{id:'nasa',url,kind:'primary',checked_at:at}],
  claims:[
   {claim:'NASA is asking for potential servicing concepts',truth_state:'attributed',
    source_ids:['nasa'],upstream_claim_id:'c-request',
    copy_span:"NASA is asking whether private teams could extend Hubble's useful life"},
   {claim:'No Hubble rescue mission has been approved yet',truth_state:'attributed',
    source_ids:['nasa'],upstream_claim_id:'c-approval',
    copy_span:'no rescue has been approved'}
  ],
  media_search:{attempted:true},media:{usage:'link-only',url},
  publish_state:'DRAFT_NOT_PUBLISHED',personal_voice_owner:'FOUNDER_TO_REVIEW',
  autopost_authorized:false
 };
 const producer=crypto.generateKeyPairSync('ed25519');
 const projection=crypto.generateKeyPairSync('ed25519');
 const trust={schema:OWNER_HARBOR_TRUST_SCHEMA,keys:[
  {role:'producer',department:'aaar',key_id:'aaar:owner:source-2026',
   actor_type:'agent',actor_id:'aaar-source-producer',status:'active',
   public_key_pem:producer.publicKey.export({type:'spki',format:'pem'})},
  {role:'projection',department:'aaar',key_id:'systemia:projection:2026',
   actor_type:'service',actor_id:'systemia-public-projection',status:'active',
   public_key_pem:projection.publicKey.export({type:'spki',format:'pem'})}
 ]};
 const digest=sha(record);
 function attest(role,pair){
  const entry=trust.keys.find(e=>e.role===role);
  return signAttestation(createAttestationPayload({
   subjectType:'systemia.harbor.source-revision',subjectId:digest,
   actor:{type:entry.actor_type,id:entry.actor_id},keyId:entry.key_id,
   issuedAt:at,claims:{
    role,department:'aaar',source_receipt_ref:record.source_receipt_ref,
    revision:record.revision,public_projection_sha256:digest,
    publication_authority:false
   }
  }),pair.privateKey);
 }
 return {
  bundle:{schema:OWNER_HARBOR_FOUNDER_SCHEMA,upstreamRecord:record,creatorDraft,
   attestations:{producer:attest('producer',producer),
    projection:attest('projection',projection)}},
  trust
 };
}
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-signed-passport-'));
 fs.chmodSync(dir,0o700);
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const intakeStateDir=path.join(dir,'intake'),passportStateDir=path.join(dir,'passport');
 fs.mkdirSync(intakeStateDir,{mode:0o700});fs.mkdirSync(passportStateDir,{mode:0o700});
 const packetFile=path.join(dir,'packet.json'),trustFile=path.join(dir,'trust.json');
 const signed=signedPacket();
 fs.writeFileSync(packetFile,JSON.stringify(signed.bundle),{mode:0o600});
 fs.writeFileSync(trustFile,JSON.stringify(signed.trust),{mode:0o600});
 const actor='adapter:systemia-founder-scout',reader='adapter:harbor-editorial';
 const passport=new EvercraftPassport({stateDir:passportStateDir});
 const grant=(subject,scope,id)=>passport.issueGrant({
  grant_id:id||'grant-'+scope.replace(/\W/g,'-'),
  idempotency_key:'grant-idempotent-'+(id||scope),
  subject_ref:subject,issuer_ref:'evercraft:identity-authority',
  product:'evercraft-intake',scopes:[scope],
  starts_at:'2026-01-01T00:00:00Z',ends_at:'2027-01-01T00:00:00Z',
  authority_state:'verified_identity_authority',
  authority_receipt_ref:'identity:owner-authorization'
 });
 const opts={packetFile,trustFile,intakeStateDir,passportStateDir,
  adapterActorRef:actor,at};
 return {dir,intakeStateDir,passportStateDir,packetFile,trustFile,
  actor,reader,opts,grant,signed};
}
test('an unsigned or ungated packet cannot create an Intake row',t=>{
 const f=fixture(t);
 const r=stageOwnedFounderEditorialIntake(f.opts);
 assert.equal(r.schema,FOUNDER_INTAKE_SCHEMA);
 assert.equal(r.reason,'passport_agent_intake_write_denied');
 assert.deepEqual(fs.readdirSync(f.intakeStateDir),[]);
});
test('two signed owner identities + real standards + current Passport grant stage only inert metadata',t=>{
 const f=fixture(t);f.grant(f.actor,'intake.write.agent');
 const r=stageOwnedFounderEditorialIntake(f.opts);
 assert.equal(r.status,'STAGED_IN_EXISTING_INTAKE');
 assert.match(r.intakeReceiptHash,/^sha256:[a-f0-9]{64}$/);
 assert.match(r.contentFingerprint,/^sha256:[a-f0-9]{64}$/);
 assert.equal(r.founderCopyStoredInIntake,false);
 assert.equal(r.publicationAuthority,false);
 assert.equal(r.personalProfileAccess,false);
 assert.equal(r.harborPickupConfirmed,false);
 const stored=fs.readFileSync(path.join(f.intakeStateDir,'candidates.jsonl'),'utf8');
 assert.equal(stored.trim().split('\n').length,1);
 for(const sensitive of ['Hubble','NASA','science.nasa','What keeps me looking','BEGIN PUBLIC KEY'])
  assert.ok(!stored.includes(sensitive));
 const obj=JSON.parse(stored.trim());
 assert.equal(obj.source_trust_state,'untrusted_external');
 assert.equal(obj.source_content_may_be_untrusted,true);
 assert.equal(obj.external_side_effects_authorized,false);
});
test('signed duplicate only one Intake record, and expired Passport grant blocks replays',t=>{
 const f=fixture(t);f.grant(f.actor,'intake.write.agent');
 const first=stageOwnedFounderEditorialIntake(f.opts);
 const second=stageOwnedFounderEditorialIntake(f.opts);
 assert.equal(second.status,'DUPLICATE_REVIEW_CANDIDATE');
 assert.equal(second.candidateId,first.candidateId);
 assert.equal(fs.readFileSync(path.join(f.intakeStateDir,'candidates.jsonl'),'utf8').trim().split('\n').length,1);
 const expired=stageOwnedFounderEditorialIntake({...f.opts,at:'2028-01-01T00:00:00Z'});
 assert.equal(expired.reason,'passport_agent_intake_write_denied');
});
test('new founder copy requires fresh original packet; creates a distinct idempotent candidate',t=>{
 const f=fixture(t);f.grant(f.actor,'intake.write.agent');
 const first=stageOwnedFounderEditorialIntake(f.opts);
 const original=JSON.parse(fs.readFileSync(f.packetFile,'utf8'));
 original.creatorDraft.copy+="\n\nThat is the part of the story I want to watch carefully.";
 fs.writeFileSync(f.packetFile,JSON.stringify(original));
 const second=stageOwnedFounderEditorialIntake(f.opts);
 assert.equal(second.status,'STAGED_IN_EXISTING_INTAKE');
 assert.notEqual(first.contentFingerprint,second.contentFingerprint);
 assert.notEqual(first.candidateId,second.candidateId);
});
test('missing signed projection actor or revoked source stops at owner inbox, no Intake file',t=>{
 const f=fixture(t);f.grant(f.actor,'intake.write.agent');
 let packet=JSON.parse(fs.readFileSync(f.packetFile,'utf8'));
 delete packet.attestations.projection;
 fs.writeFileSync(f.packetFile,JSON.stringify(packet));
 assert.equal(stageOwnedFounderEditorialIntake(f.opts).reason,'signed_source_or_canonical_editorial_hold');
 assert.deepEqual(fs.readdirSync(f.intakeStateDir),[]);
 const g=fixture(t);g.grant(g.actor,'intake.write.agent');
 const trust=JSON.parse(fs.readFileSync(g.trustFile,'utf8'));
 trust.keys[0].status='revoked';
 fs.writeFileSync(g.trustFile,JSON.stringify(trust));
 assert.equal(stageOwnedFounderEditorialIntake(g.opts).status,'HOLD');
});
test('no policy file or bogus strict paragraph count passes signed source gate',t=>{
 const f=fixture(t);f.grant(f.actor,'intake.write.agent');
 assert.equal(stageOwnedFounderEditorialIntake({...f.opts,repoRoot:'/missing/policy-root'}).status,'HOLD');
 const packet=JSON.parse(fs.readFileSync(f.packetFile,'utf8'));
 packet.creatorDraft.constraints={word_limit:100,paragraph_count:2};
 fs.writeFileSync(f.packetFile,JSON.stringify(packet));
 assert.equal(stageOwnedFounderEditorialIntake(f.opts).status,'HOLD');
 assert.deepEqual(fs.readdirSync(f.intakeStateDir),[]);
});
test('owner inbox trust and packet permissions are mandatory; symlink never accepted',t=>{
 const f=fixture(t);f.grant(f.actor,'intake.write.agent');
 fs.chmodSync(f.trustFile,0o644);
 assert.equal(stageOwnedFounderEditorialIntake(f.opts).reason,'signed_owner_inbox_not_verified');
 fs.chmodSync(f.trustFile,0o600);
 const alias=path.join(f.dir,'alias.json');fs.symlinkSync(f.packetFile,alias);
 assert.equal(stageOwnedFounderEditorialIntake({...f.opts,packetFile:alias}).reason,
  'signed_owner_inbox_not_verified');
});
test('private Intake/Passport directory cannot be world-readable or symlinked',t=>{
 const f=fixture(t);f.grant(f.actor,'intake.write.agent');
 fs.chmodSync(f.intakeStateDir,0o755);
 assert.equal(stageOwnedFounderEditorialIntake(f.opts).reason,'owner_private_runtime_not_ready');
 fs.chmodSync(f.intakeStateDir,0o700);
 const alias=path.join(f.dir,'symlink-intake');fs.symlinkSync(f.intakeStateDir,alias);
 assert.equal(stageOwnedFounderEditorialIntake({...f.opts,intakeStateDir:alias}).reason,
  'owner_private_runtime_not_ready');
});
test('Harbor reader needs separate Passport intake.read and the exact content digest',t=>{
 const f=fixture(t);f.grant(f.actor,'intake.write.agent');
 const staged=stageOwnedFounderEditorialIntake(f.opts);
 const input={candidateId:staged.candidateId,expectedContentFingerprint:staged.contentFingerprint,
  intakeStateDir:f.intakeStateDir,passportStateDir:f.passportStateDir,
  readerActorRef:f.reader,at};
 assert.equal(inspectFounderEditorialPickup(input).reason,
  'passport_intake_read_denied_or_candidate_missing');
 f.grant(f.reader,'intake.read','grant-reader');
 const found=inspectFounderEditorialPickup(input);
 assert.equal(found.schema,FOUNDER_PICKUP_SCHEMA);
 assert.equal(found.status,'READY_FOR_PRIVATE_HARBOR_REVIEW');
 assert.equal(found.harborPickupConfirmed,false);
 assert.equal(found.founderCopyExposed,false);
 assert.equal(found.publicationAuthority,false);
 assert.equal(inspectFounderEditorialPickup({...input,
  expectedContentFingerprint:'sha256:'+'f'.repeat(64)}).status,'HOLD');
});
test('local Intake read is not a real Harbor ACK or founder Meta publication',t=>{
 const f=fixture(t);f.grant(f.actor,'intake.write.agent');
 const staged=stageOwnedFounderEditorialIntake(f.opts);
 for(const key of ['publicationAuthority','personalProfileAccess',
  'providerPostCreated','harborPickupConfirmed','independentEditorialReviewed'])
  assert.equal(staged[key],false);
 assert.equal(fs.existsSync(path.join(f.dir,'outbox')),false);
 assert.equal(staged.status,'STAGED_IN_EXISTING_INTAKE');
});
