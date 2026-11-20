import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAttestationPayload,signAttestation} from '../lineage/signatures.mjs';
import {lineage} from '../lineage/core.mjs';
import {
 OWNER_HARBOR_FOUNDER_SCHEMA,OWNER_HARBOR_TRUST_SCHEMA,
 OWNER_HARBOR_RECEIPT_SCHEMA,assessOwnerHarborFounderIntake,
 inspectOwnedHarborFounderPacket,recordOwnedHarborFounderAssessment
} from './harbor-founder-owner-inbox.mjs';

const NASA='https://science.nasa.gov/missions/hubble/nasa-explores-potential-commercial-servicing-for-hubble-telescope/';
const at='2026-11-20T20:30:00.000Z';
const sha=v=>crypto.createHash('sha256').update(lineage.stable(v)).digest('hex');
function record(){
 return {
  source_department:'aaar',destination:'harbor',via:'systemia',sensitivity:'public',
  mission_id:'aaar-hubble-001',artifact_id:'public-hubble-brief-001',
  revision:'r1',source_receipt_ref:'aaar-signed-receipt-001',
  public_safe_summary:'The current request for information identifies potential commercial orbital options.',
  review_state:'in_progress',
  claims:[
   {claim_id:'c-request',text:'NASA is seeking industry concepts about potential Hubble orbital servicing.',
    evidence_state:'reported',source_urls:[NASA],uncertainty:'It is not a rescue mission approval.'},
   {claim_id:'c-approval',text:'The current request does not establish an approved rescue mission.',
    evidence_state:'reported',source_urls:[NASA],uncertainty:'No launch is promised.'}
  ]
 };
}
function draft(r){
 return {
  schema:'evercraft.creator.personal-post-candidate.v1',
  surface:'facebook-personal',format:'look-closer',
  story_id:'founder:hubble-source-bound-reflection',
  copy:"NASA is asking whether private teams could extend Hubble's useful life, but no rescue has been approved. The telescope has already given us decades of discoveries, and that doesn't make choosing what to do next any easier.\n\nWhat keeps me looking at this story is the people who have worked to keep an aging spacecraft useful. I want to understand the risks and economics of saving it instead of assuming that the most sentimental answer must also be the right one.",
  upstream_source:{source_department:r.source_department,mission_id:r.mission_id,
   artifact_id:r.artifact_id,revision:r.revision,source_receipt_ref:r.source_receipt_ref},
  angle:{why_now:'An official request for ideas has reopened a significant public debate.',
   personal_observation:'I keep thinking about the people who make long-lived machines possible.',
   real_tension:'Technical risk and cost may conflict with our wish to preserve an iconic instrument.',
   reader_value:'Readers can distinguish an invitation for servicing concepts from an approved mission.'},
  sources:[{id:'nasa',url:NASA,kind:'primary',checked_at:at}],
  claims:[
   {claim:'NASA is asking for potential servicing concepts',truth_state:'attributed',
    source_ids:['nasa'],upstream_claim_id:'c-request',
    copy_span:"NASA is asking whether private teams could extend Hubble's useful life"},
   {claim:'No Hubble rescue mission has been approved yet',truth_state:'attributed',
    source_ids:['nasa'],upstream_claim_id:'c-approval',
    copy_span:'no rescue has been approved'}
  ],
  media_search:{attempted:true},media:{usage:'link-only',url:NASA},
  publish_state:'DRAFT_NOT_PUBLISHED',personal_voice_owner:'FOUNDER_TO_REVIEW',
  autopost_authorized:false
 };
}
function setup(){
 const r=record(),d=draft(r);
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
 const digest=sha(r);
 function attestation(role,pair){
  const entry=trust.keys.find(x=>x.role===role);
  return signAttestation(createAttestationPayload({
   subjectType:'systemia.harbor.source-revision',subjectId:digest,
   actor:{type:entry.actor_type,id:entry.actor_id},keyId:entry.key_id,
   issuedAt:at,claims:{
    role,department:'aaar',source_receipt_ref:r.source_receipt_ref,
    revision:r.revision,public_projection_sha256:digest,
    publication_authority:false
   }
  }),pair.privateKey);
 }
 return {bundle:{schema:OWNER_HARBOR_FOUNDER_SCHEMA,upstreamRecord:r,creatorDraft:d,
  attestations:{producer:attestation('producer',producer),
   projection:attestation('projection',projection)}},
  trust,producer,projection};
}
const assess=(f,opt)=>assessOwnerHarborFounderIntake(f.bundle,f.trust,opt);
test('two DISTINCT registered Lineage actors and original founder standards admit review ONLY',()=>{
 const f=setup(),result=assess(f);
 assert.equal(result.schema,OWNER_HARBOR_RECEIPT_SCHEMA);
 assert.equal(result.status,'READY_FOR_INDEPENDENT_EDITORIAL_REVIEW');
 assert.equal(result.source_attestations_valid,true);
 assert.match(result.verified_source_revision_digest,/^sha256:[a-f0-9]{64}$/);
 assert.match(result.founder_copy_digest,/^sha256:[a-f0-9]{64}$/);
 assert.equal(result.policy_source_hashes.length,5);
 assert.equal(result.live_harbor_receiver_observed,false);
 assert.equal(result.original_web_sources_fetched_by_this_tool,false);
 assert.equal(result.founder_profile_publishing_authorized,false);
 assert.equal(result.provider_posted,false);
 assert.equal(result.independent_editorial_review_completed,false);
 const output=JSON.stringify(result);
 for(const banned of ['What keeps me looking','NASA is asking whether','BEGIN PUBLIC KEY','aaar-hubble-001'])
  assert.ok(!output.includes(banned),banned);
});
test('unsigned or externally self-asserted producer/projection claims remain held',()=>{
 const f=setup();
 f.bundle.source_verified=true;f.bundle.reviewed_by_harbor=true;f.bundle.founder_approved=true;
 delete f.bundle.attestations.projection;
 assert.equal(assess(f).status,'HOLD');
 assert.equal(assess(f).reason,'independent_producer_and_projection_actors_required');
});
test('same key pretending to be both independent roles is prohibited',()=>{
 const f=setup();
 f.trust.keys[1].public_key_pem=f.trust.keys[0].public_key_pem;
 assert.equal(assess(f).reason,'distinct_real_signing_keys_required');
 const g=setup();g.trust.keys[1].actor_id=g.trust.keys[0].actor_id;
 assert.equal(assess(g).reason,'independent_producer_and_projection_actors_required');
});
test('changing a signed headline or source claim without reattestation holds',()=>{
 const f=setup();f.bundle.upstreamRecord.claims[0].text='NASA approved a launch';
 assert.equal(assess(f).reason,'two_role_attestations_not_verified');
});
test('revoked source or projection identity cannot approve candidate',()=>{
 for(const role of ['producer','projection']){
  const f=setup();f.trust.keys.find(x=>x.role===role).status='revoked';
  assert.equal(assess(f).reason,'two_role_attestations_not_verified');
 }
});
test('swapped signed actor IDs, roles and source departments all fail closed',()=>{
 const f=setup();f.trust.keys[0].actor_id='impersonator';
 assert.equal(assess(f).reason,'two_role_attestations_not_verified');
 const g=setup();g.bundle.attestations.producer.payload.claims.role='projection';
 assert.equal(assess(g).reason,'two_role_attestations_not_verified');
 const h=setup();h.bundle.upstreamRecord.source_department='towi';
 assert.equal(assess(h).reason,'two_role_attestations_not_verified');
});
test('unsigned founder draft revision or invented claim cannot piggyback on signed research',()=>{
 const f=setup();f.bundle.creatorDraft.claims[0].upstream_claim_id='c-fabricated';
 const r=assess(f);assert.equal(r.status,'HOLD');
 assert.equal(r.reason,'creator_claim_not_in_verified_upstream');
 const g=setup();g.bundle.creatorDraft.upstream_source.revision='newer-revision';
 assert.equal(assess(g).reason,'creator_upstream_revision_not_bound');
});
test('canonically forbidden 100-word rule blocks even with two valid signatures',()=>{
 const f=setup();f.bundle.creatorDraft.constraints={word_limit:100,paragraph_count:2};
 const r=assess(f);
 assert.equal(r.status,'HOLD');
 assert.equal(r.reason,'founder_canonical_editorial_preflight_held');
 assert.ok(r.blockers.includes('invented_length_rule_forbidden'));
});
test('missing original publishing standard holds despite valid cryptography',()=>{
 const f=setup();
 const r=assess(f,{repoRoot:'/nonexistent/policy-root'});
 assert.equal(r.status,'HOLD');
 assert.equal(r.reason,'canonical_policy_or_candidate_preflight_unavailable');
});
test('trusted trust registry cannot be injected via untrusted packet',()=>{
 const f=setup();
 f.bundle.trust=f.trust;const noTrust={schema:OWNER_HARBOR_TRUST_SCHEMA,keys:[]};
 assert.equal(assessOwnerHarborFounderIntake(f.bundle,noTrust).status,'HOLD');
});
test('owner private input files must remain mode 0600 and inside owner 0700 directories',t=>{
 if(process.getuid?.()===0)return t.skip('private owner non-root canary only');
 const f=setup(),root=fs.mkdtempSync(path.join(os.tmpdir(),'harbor-founder-'));
 fs.chmodSync(root,0o700);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const input=path.join(root,'packet.json'),trust=path.join(root,'trust.json');
 fs.writeFileSync(input,JSON.stringify(f.bundle),{mode:0o600});
 fs.writeFileSync(trust,JSON.stringify(f.trust),{mode:0o600});
 const r=inspectOwnedHarborFounderPacket({packetFile:input,trustFile:trust});
 assert.equal(r.assessment.status,'READY_FOR_INDEPENDENT_EDITORIAL_REVIEW');
 assert.match(r.packetDigest,/^[a-f0-9]{64}$/);
 fs.chmodSync(trust,0o644);
 assert.throws(()=>inspectOwnedHarborFounderPacket({packetFile:input,trustFile:trust}),
  /unsafe_private_json_file/);
});
test('owner local receipt is idempotent with NO account or HTTP publication',t=>{
 if(process.getuid?.()===0)return t.skip('private owner non-root canary only');
 const f=setup(),root=fs.mkdtempSync(path.join(os.tmpdir(),'harbor-receipt-'));
 fs.chmodSync(root,0o700);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const result=assess(f);
 const data={assessment:result,packetDigest:sha(f.bundle),receiptDir:root};
 const first=recordOwnedHarborFounderAssessment(data);
 assert.equal(first.state,'PRIVATE_RECEIPT_RECORDED');
 const second=recordOwnedHarborFounderAssessment(data);
 assert.equal(second.state,'EXISTING_IDEMPOTENT_RECEIPT');
 const files=fs.readdirSync(root);assert.equal(files.length,1);
 const file=path.join(root,files[0]);
 assert.equal(fs.statSync(file).mode&0o777,0o600);
 const stored=fs.readFileSync(file,'utf8');
 assert.doesNotMatch(stored,/What keeps me looking|BEGIN PUBLIC KEY|NASA is asking whether/);
 assert.ok(!('provider_post_id' in JSON.parse(stored)));
});
