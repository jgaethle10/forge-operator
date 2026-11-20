import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EvercraftPassport} from '../passport/passport.mjs';
import {EvercraftIntakeFabric} from '../intake-fabric/intake.mjs';
import {assessPartnerProspect,buildPartnerIntakeCandidate,
 PARTNER_PROSPECT_SCHEMA,PARTNER_TRIAGE_SCHEMA} from './two-lane-discovery.mjs';

const at='2026-11-20T14:05:00.000Z';
const doc=()=>({schema:PARTNER_PROSPECT_SCHEMA,case_id:'abc123def456abc123def456',
 revision:1,lane:'EPS_OPERATING',source_mode:'research',country:'US',
 equipment_categories:['excavator','backhoe'],specialties:['excavation','grading'],
 remote_collaboration_possible:true,
 source_evidence:[{url:'https://www.example.org/business/field-operator',
   observed_at:at,kind:'business_website'}]});
const sales=()=>{
 const p=doc();
 p.lane='PRODUCT_DISTRIBUTION';
 p.sales_channels=['consulting','professional newsletter'];
 p.product_keys=['evercraft-research'];
 delete p.equipment_categories;
 return p;
};
const epsReview=()=>({originalSourceChecked:true,counterpartyIdentityChecked:true,
 regionEligibilityChecked:true,consentBasedContactRouteChecked:true,
 equipmentAndOwnershipChecked:true,crewAndCapacityChecked:true,
 licenseInsuranceSafetyChecked:true,remoteOpsInterestConfirmed:true});
const salesReview=()=>({originalSourceChecked:true,counterpartyIdentityChecked:true,
 regionEligibilityChecked:true,consentBasedContactRouteChecked:true,
 audienceAndChannelChecked:true,permissionedSalesPracticeChecked:true,
 independentProductFitChecked:true});
test('EPS strong lead is a founder discussion candidate, not a 50/50 signed contract',()=>{
 const r=assessPartnerProspect(doc(),{trustedReview:epsReview()});
 assert.equal(r.schema,PARTNER_TRIAGE_SCHEMA);
 assert.equal(r.stage,'READY_FOR_FOUNDER_DISCUSSION');
 assert.deepEqual(r.missing,[]);
 assert.equal(r.economics.structure,'FOUNDER_PROPOSED_50_50_OPERATING_PARTNERSHIP');
 assert.equal(r.economics.splitBasis,'UNDEFINED_PENDING_SIGNED_TERMS');
 assert.equal(r.economics.equityOrGrossRevenueShareGuaranteed,false);
 assert.equal(r.boundaries.outboundContactAuthorized,false);
 assert.equal(r.boundaries.legalAgreementCreated,false);
 assert.equal(r.boundaries.automaticCommission,false);
 assert.ok(r.match.fitScore>0);
 assert.equal(r.match.verifiedCapabilityFit,false);
});
test('operator self-reported assets do not become independently verified gear, crews or insurance',()=>{
 const p=doc();
 const r=assessPartnerProspect(p);
 assert.equal(r.stage,'PRIVATE_QUALIFICATION_PENDING');
 for(const code of ['equipment_and_control_unverified','crew_and_capacity_unverified',
 'licensing_insurance_safety_unverified','remote_ops_partner_interest_unverified'])
  assert.ok(r.missing.includes(code),code);
 assert.equal(r.boundaries.agentEnrollmentAllowed,false);
});
test('distribution program has no publicly quotable rate, compensation or recruiting reward',()=>{
 const r=assessPartnerProspect(sales(),{trustedReview:salesReview(),
  approvedFulfillableProductKeys:['evercraft-research']});
 assert.equal(r.stage,'READY_FOR_FOUNDER_DISCUSSION');
 assert.equal(r.economics.commissionRate,'UNSET');
 assert.equal(r.economics.recruitmentPaymentsAllowed,false);
 assert.equal(r.economics.partnerAgreementExecuted,false);
 assert.equal(r.boundaries.outboundContactAuthorized,false);
});
test('named product in a prospect cannot prove an owned fulfillable offer',()=>{
 const r=assessPartnerProspect(sales(),{trustedReview:salesReview(),
  approvedFulfillableProductKeys:[]});
 assert.equal(r.stage,'PRIVATE_QUALIFICATION_PENDING');
 assert.ok(r.missing.includes('no_independently_verified_fulfillable_offer'));
 const spoof=sales();spoof.trustedReview=salesReview();
 assert.ok(assessPartnerProspect(spoof).missing.includes('audience_and_channels_unverified'));
});
test('source-free and private-host URLs remain research-only',()=>{
 const p=doc();p.source_evidence=[];
 assert.equal(assessPartnerProspect(p,{trustedReview:epsReview()}).stage,'NEEDS_SOURCE_EVIDENCE');
 for(const url of ['http://localhost:8788/records','https://192.168.1.2/internal',
   'https://equipment.local/test','https://operator:secret@example.org/private']){
  const x=doc();x.source_evidence=[{url,kind:'business_website',observed_at:at}];
  assert.ok(assessPartnerProspect(x).missing.includes('original_source_evidence_required'));
 }
});
test('reject personal contact data and malformed anonymous case identity',()=>{
 for(const field of ['email','phone','personal_contact','private_notes','raw_message']){
  const p=doc();p[field]='private-person@example.org';
  assert.throws(()=>assessPartnerProspect(p),/private_contact_material_forbidden/);
 }
 const p=doc();p.case_id='public-personal-name';
 assert.throws(()=>assessPartnerProspect(p),/schema_or_identity_invalid/);
});
test('builds one inert, privacy-minimized Systemia candidate per case and revision',()=>{
 const p=doc();
 const c=buildPartnerIntakeCandidate(p,{adapterActorRef:'adapter:harbor-partner-scout',receivedAt:at});
 assert.equal(c.source_type,'agent');
 assert.equal(c.source_trust_state,'untrusted_external');
 assert.equal(c.idempotency_key,'partner-discovery:'+p.case_id+':v1');
 assert.ok(c.content_fingerprint.startsWith('sha256:'));
 assert.equal(c.attachments.length,0);
 assert.equal(c.source_ref,'harbor:partner-opportunity-research');
 assert.deepEqual(c.requested_capability_hints,
   ['evercraft-property-services','opportunity-fabric','remote-ops','partner-screening']);
 const printable=JSON.stringify(c);
 for(const forbidden of ['example.org','excavator','backhoe','person@example',
   'license_document','50% of equity'])assert.ok(!printable.includes(forbidden));
 assert.deepEqual(buildPartnerIntakeCandidate(p,{adapterActorRef:'adapter:harbor-partner-scout',receivedAt:at}),c);
 p.revision=2;
 const next=buildPartnerIntakeCandidate(p,{adapterActorRef:'adapter:harbor-partner-scout',receivedAt:at});
 assert.notEqual(c.idempotency_key,next.idempotency_key);
 assert.notEqual(c.content_fingerprint,next.content_fingerprint);
});
test('existing Intake Fabric requires real Passport scope and deduplicates repeat discovery',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-partner-qualify-'));
 fs.chmodSync(root,0o700);
 try{
  const stateDir=path.join(root,'intake'),passportStateDir=path.join(root,'passport');
  const intake=new EvercraftIntakeFabric({stateDir,passportStateDir});
  const candidate=buildPartnerIntakeCandidate(doc(),{
   adapterActorRef:'adapter:harbor-partner-scout',receivedAt:at});
  assert.throws(()=>intake.ingest(candidate),/intake_adapter_not_authorized/);
  const passport=new EvercraftPassport({stateDir:passportStateDir});
  passport.issueGrant({
   grant_id:'partner-scout-agent',
   idempotency_key:'partner-scout-grant-2026',
   subject_ref:'adapter:harbor-partner-scout',
   issuer_ref:'evercraft:identity-authority',
   product:'evercraft-intake',
   scopes:['intake.write.agent'],
   starts_at:'2026-01-01T00:00:00Z',
   ends_at:'2027-12-31T00:00:00Z',
   authority_state:'verified_identity_authority',
   authority_receipt_ref:'identity:authorized-partner-scout'
  });
  const admitted=intake.ingest(candidate);
  assert.ok(admitted.candidate.candidate_id);
  assert.equal(admitted.candidate.execution_authority_granted,false);
  assert.equal(admitted.candidate.raw_payload_stored_in_intake,false);
  assert.equal(admitted.candidate.source_trust_state,'untrusted_external');
  assert.equal(intake.ingest(candidate).state,'duplicate');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('applicant interest requires separately recorded consent and still never authorizes outreach',()=>{
 const p=doc();p.source_mode='applicant_interest';
 assert.throws(()=>assessPartnerProspect(p),/permission_state_not_recorded/);
 p.permission_state='CONSENT_DOCUMENTED';
 const r=assessPartnerProspect(p);
 assert.equal(r.boundaries.outboundContactAuthorized,false);
 assert.equal(r.boundaries.legalAgreementCreated,false);
});
