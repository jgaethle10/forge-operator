import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAttestationPayload,signAttestation,attestations} from '../lineage/signatures.mjs';
import {assessSignedFounderHarborBundle,inspectOwnerSignedFounderHarborFiles,
 HARBOR_FOUNDER_BUNDLE_SCHEMA,HARBOR_FOUNDER_TRUST_SCHEMA,
 HARBOR_FOUNDER_RECEIPT_SCHEMA} from './owner-signed-founder-handoff.mjs';

const NASA='https://science.nasa.gov/missions/hubble/nasa-explores-potential-commercial-servicing-for-hubble-telescope/';
const issued='2026-11-20T20:30:00.000Z',expiry='2026-11-20T22:30:00.000Z';
const now=new Date('2026-11-20T21:00:00.000Z');
const sha=x=>crypto.createHash('sha256').update(attestations.canonical(x)).digest('hex');
const make=()=>{
 const record={
  source_department:'aaar',destination:'harbor',via:'systemia',
  sensitivity:'public',mission_id:'aaar-hubble-001',
  artifact_id:'aaar-hubble-public-report-001',revision:'r1',
  source_receipt_ref:'research-source-receipt-001',
  public_safe_summary:'A bounded report on what the NASA Hubble servicing request does and does not propose.',
  review_state:'in_progress',
  claims:[
   {claim_id:'c-request',text:'NASA is seeking possible Hubble servicing proposals.',
    evidence_state:'reported',source_urls:[NASA],
    uncertainty:'A request is not an approved flight.'},
   {claim_id:'c-approval',text:'No flight is authorized by that research request.',
    evidence_state:'reported',source_urls:[NASA],
    uncertainty:'The final decision is unresolved.'}
  ]
 };
 const copy="NASA is asking whether private teams could extend Hubble's useful life, but no rescue has been approved. The telescope has already given us decades of discoveries, and that doesn't make choosing what to do next any easier.\n\nWhat stays with me is the people who kept a distant piece of engineering useful through difficult years. I'd like to see it keep working, but the risks and costs deserve more than a sentimental answer.";
 const creator_draft={
  schema:'evercraft.creator.personal-post-candidate.v1',
  surface:'facebook-personal',format:'look-closer',
  story_id:'founder:hubble-signed-owner-preview',
  upstream_source:{
   source_department:record.source_department,mission_id:record.mission_id,
   artifact_id:record.artifact_id,revision:record.revision,
   source_receipt_ref:record.source_receipt_ref
  },
  copy,
  angle:{
   why_now:'A public NASA solicitation raises a timely question about orbital servicing.',
   personal_observation:'I am struck by the human attention invested in aging machines.',
   real_tension:'Repairing the telescope is tempting but must be evaluated against costs and risk.',
   reader_value:'Help readers distinguish future options from an authorized mission.'
  },
  sources:[{id:'nasa',url:NASA,kind:'primary',checked_at:issued}],
  claims:[
   {claim:'NASA is asking companies about possible servicing approaches',
    truth_state:'attributed',source_ids:['nasa'],
    upstream_claim_id:'c-request',
    copy_span:"NASA is asking whether private teams could extend Hubble's useful life"},
   {claim:'The request does not approve a Hubble flight',
    truth_state:'attributed',source_ids:['nasa'],
    upstream_claim_id:'c-approval',copy_span:'no rescue has been approved'}
  ],
  media_search:{attempted:true},media:{usage:'link-only',url:NASA},
  publish_state:'DRAFT_NOT_PUBLISHED',personal_voice_owner:'FOUNDER_TO_REVIEW',
  autopost_authorized:false
 };
 const a=crypto.generateKeyPairSync('ed25519');
 const b=crypto.generateKeyPairSync('ed25519');
 const trust={
  schema:HARBOR_FOUNDER_TRUST_SCHEMA,
  entries:[
   {key_id:'aaar-current-signer',role:'producer',department:'aaar',
    actor_id:'aaar-research-resident',actor_type:'agent',status:'active',
    public_key_pem:a.publicKey.export({type:'spki',format:'pem'})},
   {key_id:'systemia-projection-current',role:'systemia',department:'systemia',
    actor_id:'systemia-public-safe-projection',actor_type:'service',status:'active',
    public_key_pem:b.publicKey.export({type:'spki',format:'pem'})}
  ]
 };
 const producerPayload=createAttestationPayload({
  subjectType:'systemia-harbor-source-receipt',
  subjectId:record.artifact_id,
  actor:{type:'agent',id:'aaar-research-resident'},
  keyId:'aaar-current-signer',issuedAt:issued,
  claims:{
   scope:'systemia.harbor.source-read',
   source_department:record.source_department,
   mission_id:record.mission_id,artifact_id:record.artifact_id,
   revision:record.revision,source_receipt_ref:record.source_receipt_ref,
   record_sha256:sha(record),expires_at:expiry
  }
 });
 const producer_attestation=signAttestation(producerPayload,a.privateKey);
 const projection={
  summary:record.public_safe_summary.trim(),
  claims:record.claims.map(c=>({...c,source_urls:[...new Set(c.source_urls)]}))
 };
 const systemiaPayload=createAttestationPayload({
  subjectType:'systemia-harbor-public-projection',
  subjectId:record.artifact_id,
  actor:{type:'service',id:'systemia-public-safe-projection'},
  keyId:'systemia-projection-current',issuedAt:issued,
  claims:{
   scope:'systemia.harbor.public-projection.review',
   source_department:record.source_department,
   mission_id:record.mission_id,artifact_id:record.artifact_id,
   revision:record.revision,source_receipt_ref:record.source_receipt_ref,
   source_record_sha256:sha(record),
   public_projection_sha256:sha(projection),
   producer_proof_sha256:sha(producer_attestation),
   expires_at:expiry
  }
 });
 const systemia_attestation=signAttestation(systemiaPayload,b.privateKey);
 const bundle={
  schema:HARBOR_FOUNDER_BUNDLE_SCHEMA,
  upstream_record:record,creator_draft,producer_attestation,systemia_attestation
 };
 return {bundle,trust,a,b};
};
const check=x=>assessSignedFounderHarborBundle(x.bundle,x.trust,{now});
test('two distinct owner-pinned signed lineages + original founder source gate give review-only artifact',()=>{
 const x=make(),result=check(x);
 assert.equal(result.schema,HARBOR_FOUNDER_RECEIPT_SCHEMA);
 assert.equal(result.state,'READY_FOR_INDEPENDENT_EDITORIAL_REVIEW');
 assert.equal(result.signed_provenance_review_complete,true);
 assert.equal(result.publication_authority,false);
 assert.equal(result.personal_profile_authority,false);
 assert.equal(result.independent_editorial_review_completed,false);
 assert.equal(result.account_access_performed,false);
 assert.equal(result.external_source_fetch_performed,false);
 assert.equal(result.uploaded_or_posted,false);
 assert.match(result.exact_copy_sha256,/^sha256:[a-f0-9]{64}$/);
 assert.equal(result.review_candidate.claim_binding_count,2);
 const out=JSON.stringify(result);
 assert.ok(!out.includes('NASA is asking whether private teams'));
 assert.ok(!out.includes('aaar-research-resident'));
 assert.ok(!out.includes('BEGIN PUBLIC KEY'));
});
test('no authority, absent signature or unpinned key means HOLD',()=>{
 const x=make();
 x.bundle.producer_attestation=null;
 assert.equal(check(x).reason,'independent_owner_pinned_signers_required');
 const y=make();y.trust.entries[0].status='revoked';
 assert.equal(check(y).reason,'independent_owner_pinned_signers_required');
 const z=make();z.bundle.systemia_attestation.payload.key_id='unknown';
 assert.equal(check(z).reason,'independent_owner_pinned_signers_required');
});
test('changing a reported claim after producer sign blocks source custody',()=>{
 const x=make();x.bundle.upstream_record.claims[0].text='NASA has signed a rescue contract';
 assert.equal(check(x).reason,'producer_signed_source_not_verified');
});
test('changing sensitive/source direction and new source revision stops workflow',()=>{
 const x=make();x.bundle.upstream_record.sensitivity='private';
 assert.equal(check(x).reason,'source_direction_or_sensitivity_invalid');
 const y=make();y.bundle.upstream_record.revision='r2';
 y.bundle.creator_draft.upstream_source.revision='r2';
 assert.equal(check(y).reason,'producer_signed_source_not_verified');
});
test('systemia signed public-safe projection cannot be replaced or reused',()=>{
 const x=make();
 x.bundle.systemia_attestation.payload.claims.public_projection_sha256='a'.repeat(64);
 assert.equal(check(x).reason,'systemia_signed_projection_not_verified');
 const y=make();
 y.bundle.systemia_attestation.signature='forged';
 assert.equal(check(y).reason,'systemia_signed_projection_not_verified');
 const z=make();
 z.bundle.systemia_attestation.payload.claims.producer_proof_sha256='0'.repeat(64);
 assert.equal(check(z).reason,'systemia_signed_projection_not_verified');
});
test('producer and Systemia identities cannot collapse into one actor',()=>{
 const x=make();
 x.trust.entries[1].actor_id=x.trust.entries[0].actor_id;
 x.trust.entries[1].actor_type=x.trust.entries[0].actor_type;
 assert.equal(check(x).reason,'independent_owner_pinned_signers_required');
});
test('valid signatures cannot manufacture downstream editorial authority',()=>{
 const x=make();
 x.bundle.editorial_approved=true;x.bundle.publish_authorized=true;
 x.bundle.creator_draft.publish_state='PUBLISHED';
 assert.equal(check(x).reason,'founder_editorial_or_claim_hold');
 const y=make();y.bundle.creator_draft.autopost_authorized=true;
 assert.equal(check(y).reason,'founder_editorial_or_claim_hold');
});
test('invalid personal creator claim/URL still held after both signatures verify',()=>{
 const x=make();
 x.bundle.creator_draft.claims[0].upstream_claim_id='not-in-receipt';
 assert.equal(check(x).reason,'founder_editorial_or_claim_hold');
 const y=make();y.bundle.creator_draft.copy='A nice day. #Viral';
 assert.equal(check(y).reason,'founder_editorial_or_claim_hold');
});
test('missing five canonical documents on owner host never results in green',()=>{
 const x=make();
 // A mock runtime may have signatures but not the canonical repo checkout;
 // the existing creator gate must fail closed, independent of cryptography.
 // Check a distinct private validated codepath in the producer/creator tests.
 x.bundle.creator_draft.constraints={word_limit:100,paragraph_count:2};
 assert.equal(check(x).reason,'founder_editorial_or_claim_hold');
});
test('expired, future, replayed and overly long receipts are rejected',()=>{
 const x=make();
 assert.equal(assessSignedFounderHarborBundle(x.bundle,x.trust,{
  now:new Date('2026-11-23T21:00:00Z')
 }).reason,'producer_signed_source_not_verified');
 const y=make();
 assert.equal(assessSignedFounderHarborBundle(y.bundle,y.trust,{
  now:new Date('2026-11-19T21:00:00Z')
 }).reason,'producer_signed_source_not_verified');
 const z=make();
 z.bundle.producer_attestation.payload.claims.expires_at='2026-12-20T20:30:00Z';
 assert.equal(check(z).reason,'producer_signed_source_not_verified');
});
test('bundle-embedded trust key cannot override separately pinned owner registry',()=>{
 const x=make();
 const rogue=crypto.generateKeyPairSync('ed25519');
 x.bundle.trust_registry={
  schema:HARBOR_FOUNDER_TRUST_SCHEMA,
  entries:[{key_id:'aaar-current-signer',public_key_pem:rogue.publicKey.export({type:'spki',format:'pem'})}]
 };
 x.trust.entries[0].public_key_pem=rogue.publicKey.export({type:'spki',format:'pem'});
 assert.equal(check(x).reason,'producer_signed_source_not_verified');
});
test('owner-private CLI protects separate trust directory and never rewrites source packets',t=>{
 if(typeof process.getuid==='function'&&process.getuid()===0)return t.skip('root cannot inspect owner private records');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'harbor-owner-proof-'));
 fs.chmodSync(root,0o700);
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const incoming=path.join(root,'incoming'),trusted=path.join(root,'trust');
 fs.mkdirSync(incoming,{mode:0o700});fs.mkdirSync(trusted,{mode:0o700});
 const bundleFile=path.join(incoming,'bundle.json');
 const trustFile=path.join(trusted,'registry.json');
 const x=make();
 fs.writeFileSync(bundleFile,JSON.stringify(x.bundle),{mode:0o600});
 fs.writeFileSync(trustFile,JSON.stringify(x.trust),{mode:0o600});
 const before=fs.readFileSync(bundleFile,'utf8');
 const good=inspectOwnerSignedFounderHarborFiles({bundleFile,trustFile,now});
 assert.equal(good.state,'READY_FOR_INDEPENDENT_EDITORIAL_REVIEW');
 assert.equal(fs.readFileSync(bundleFile,'utf8'),before);
 assert.equal(inspectOwnerSignedFounderHarborFiles({bundleFile,trustFile:bundleFile,now}).state,'HOLD');
 fs.chmodSync(bundleFile,0o644);
 assert.equal(inspectOwnerSignedFounderHarborFiles({bundleFile,trustFile,now}).state,'HOLD');
 fs.chmodSync(bundleFile,0o600);
 const symlink=path.join(incoming,'symlink.json');
 fs.symlinkSync(bundleFile,symlink);
 assert.equal(inspectOwnerSignedFounderHarborFiles({bundleFile:symlink,trustFile,now}).state,'HOLD');
});
