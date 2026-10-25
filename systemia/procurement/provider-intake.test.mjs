import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareGovernmentProviderIntake,quarantinePortalReceipt,supportedGovernmentTargets,syntheticDigest} from './provider-intake.mjs';

const good=(target='wa_hrsn_remediation')=>({
  target_id:target,
  official_url:target==='wa_hrsn_remediation'?'https://www.dshs.wa.gov/information-potential-medicaid-contractors':
    target==='wa_pwsbe'?'https://omwbe.diversitycompliance.com/':
    target==='wa_webs'?'https://pr-webs-vendor.des.wa.gov/':'https://mrscrosters.org/',
  mission_id:'government-provider-20261025',
  evidence:{business_identity:{state:'verified',evidence_digest:syntheticDigest('synthetic-business-fixture')}},
  draft_fields:[{field:'legal_business_name',evidence_key:'business_identity'}],
  free_only:true,
});

test('four first-party procurement paths are explicit',()=>{
  assert.deepEqual(supportedGovernmentTargets(),['wa_webs','wa_pwsbe','wa_mrsc_vendor','wa_hrsn_remediation']);
});
test('incomplete HRSN remains blocked without imagined browser run or submission',()=>{
  const p=prepareGovernmentProviderIntake(good());
  assert.equal(p.preflight_state,'blocked_evidence_incomplete');
  assert.ok(p.evidence_keys_blocking.includes('current_scope_insurance'));
  assert.ok(p.evidence_keys_blocking.includes('experience_evidence'));
  assert.equal(p.portal_draft_state,'not_saved');
  assert.equal(p.submission_state,'not_attempted');
  assert.equal(p.runtime_admission_state,'unverified');
  assert.equal(p.automated_final_submission_authority,false);
  assert.equal(JSON.stringify(p).includes('synthetic-business-fixture'),false);
});
test('synthetically complete WEBS preflight does not imply any real account or approval',()=>{
  const input=good('wa_webs');
  input.evidence.business_license={state:'verified',evidence_digest:syntheticDigest('synthetic-license')};
  input.evidence.authorized_representative={state:'verified',evidence_digest:syntheticDigest('synthetic-rep')};
  const p=prepareGovernmentProviderIntake(input);
  assert.equal(p.preflight_state,'offline_preflight_ready');
  assert.equal(p.portal_session_state,'not_started');
  assert.equal(p.agency_acceptance_state,'unverified');
});
test('exact official HTTPS hosts; reject lookalikes, embedded credentials and ports',()=>{
  for(const url of [
    'http://www.dshs.wa.gov/forms','https://www.dshs.wa.gov.evil.example/forms',
    'https://user:pass@www.dshs.wa.gov/','https://www.dshs.wa.gov:8443/','https://example.org/',
  ]){
    assert.throws(()=>prepareGovernmentProviderIntake({...good(),official_url:url}),/unverified_official_origin/);
  }
});
test('unexpected raw identity, financial records and restricted draft fields rejected',()=>{
  const g=good();
  assert.throws(()=>prepareGovernmentProviderIntake({...g,bank_account:'1234'}),/untrusted_intake_shape/);
  assert.throws(()=>prepareGovernmentProviderIntake({...g,draft_fields:[{field:'owner_signature',evidence_key:'business_identity'}]}),/forbidden_or_duplicate_draft_field/);
  assert.throws(()=>prepareGovernmentProviderIntake({...g,draft_fields:[{field:'contact_email',evidence_key:'business_identity',value:'private@example.test'}]}),/untrusted_draft_field_shape/);
  assert.throws(()=>prepareGovernmentProviderIntake({...g,evidence:{business_identity:{state:'verified',evidence_digest:syntheticDigest('ok'),value:'sensitive'}}}),/untrusted_evidence_shape/);
});
test('payment not automatically authorized',()=>{
  assert.throws(()=>prepareGovernmentProviderIntake({...good(),free_only:false}),/payment_not_authorized/);
  assert.throws(()=>prepareGovernmentProviderIntake({...good(),free_only:undefined}),/payment_not_authorized/);
});
test('unverified source evidence cannot feed a draft field',()=>{
  const g=good();g.evidence.business_identity.state='pending';
  assert.throws(()=>prepareGovernmentProviderIntake(g),/unverified_draft_field_source/);
});
test('portal receipt is quarantined and does not advance real application state',()=>{
  const r=quarantinePortalReceipt({target_id:'wa_hrsn_remediation',mission_id:'government-provider-20261025',receipt_sha256:syntheticDigest('synthetic'),observed_channel:'portal_submission'});
  assert.equal(r.verification_state,'requires_independent_portal_readback');
  assert.equal(r.submission_or_approval_proven,false);
  assert.equal('submission_state' in r,false);
});
test('reject fake portal receipts and receipt bodies',()=>{
  const r={target_id:'wa_webs',mission_id:'government-provider-20261025',receipt_sha256:syntheticDigest('synthetic'),observed_channel:'portal_saved_draft'};
  assert.throws(()=>quarantinePortalReceipt({...r,receipt_sha256:'not-hash'}),/receipt_digest_required/);
  assert.throws(()=>quarantinePortalReceipt({...r,html:'private content'}),/untrusted_receipt_shape/);
  assert.throws(()=>quarantinePortalReceipt({...r,observed_channel:'approved'}),/unsupported_receipt_channel/);
});
