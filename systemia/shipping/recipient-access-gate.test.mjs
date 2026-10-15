import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signMessage } from 'node:crypto';
import test from 'node:test';
import { shippingAttestationPayload, verifyRecipientAccess } from './recipient-access-gate.mjs';

const { privateKey: TEST_SIGNER, publicKey: TEST_VERIFIER } = generateKeyPairSync('ed25519');
const { publicKey: WRONG_VERIFIER } = generateKeyPairSync('ed25519');
const PUBLIC_KEY = TEST_VERIFIER.export({ type:'spki', format:'pem' });
const WRONG_KEY = WRONG_VERIFIER.export({ type:'spki', format:'pem' });
const SHA = 'a'.repeat(64);
const TIME = Date.parse('2026-10-14T20:00:00Z');
const plan = {
  release_key:'fixture-partner-brief',
  release_fingerprint:'sha256:' + 'b'.repeat(64),
  recipient_ref:'test-buyer@example.invalid',
  channel:'email',
  authorization_ref:'human-approval-fixture-only',
  ready:true,
  channel_contract:{external_send:true},
  package_manifest:{
    pass:true,
    package_digest:'sha256:' + 'c'.repeat(64),
    artifacts:[{
      client_filename:'Customer Brief.pdf',
      sha256:'sha256:' + SHA,
      mime_type:'application/pdf',
      size_bytes:1200,
      render_verified:true
    }]
  }
};
const base = {
  verifier_id:'evercraft-independent-shipping-verifier-v1',
  nonce:'0123456789abcdef0123456789abcdef',
  verified_at:new Date(TIME).toISOString(),
  mode:'external_attachment',
  claims_reviewed:true,
  references_complete:true,
  references:[],
  restricted_dependency_count:0,
  client_preview_filename:'Customer Brief.pdf',
  provider_attachment_proofs:[{
    client_filename:'Customer Brief.pdf',provider_readback:true,sha256:'sha256:' + SHA
  }]
};
function signed(evidence = base, releasePlan = plan) {
  const copy = structuredClone(evidence);
  copy.signature = signMessage(null,
    Buffer.from(shippingAttestationPayload({plan:releasePlan, evidence:copy})),
    TEST_SIGNER).toString('base64url');
  return copy;
}
function verdict(overrides = {}, { releasePlan = plan, public_key = PUBLIC_KEY, now = TIME } = {}) {
  return verifyRecipientAccess({ plan:releasePlan,
    evidence:signed({...structuredClone(base), ...overrides}, releasePlan),
    trusted_verifier_public_key:public_key, now });
}
function held(value, reason) {
  assert.equal(value.pass,false);
  assert.ok(value.reasons.includes(reason), JSON.stringify(value.reasons));
}

test('independently signed provider PDF attachment readback passes pre-send', () => {
  const out=verdict();
  assert.equal(out.pass,true);
  assert.equal(out.status,'recipient_preflight_passed');
  assert.equal(out.boundary.provider_send_not_inferred,true);
  assert.equal(out.boundary.customer_open_not_inferred_from_attachment,true);
});
test('missing trusted verifier public key cannot release', () => held(verdict({}, {public_key:null}), 'trusted_verifier_public_key_not_configured'));
test('wrong key cannot authenticate a signer', () => {
  const out=verifyRecipientAccess({plan,evidence:signed(),trusted_verifier_public_key:WRONG_KEY,now:TIME});
  held(out,'shipping_signature_invalid_or_tampered');
});
test('tampered attachment hash after attestation is denied', () => {
  const ev=signed();ev.provider_attachment_proofs[0].sha256='sha256:'+'d'.repeat(64);
  held(verifyRecipientAccess({plan,evidence:ev,trusted_verifier_public_key:PUBLIC_KEY,now:TIME}),'provider_attachment_0_hash_or_readback_mismatch');
});
test('signed receipt with missing provider readback is denied',()=>held(verdict({provider_attachment_proofs:[]}), 'provider_attachment_count_mismatch'));
test('signed ZIP-only buyer preview is rejected',()=>{
  const bad=structuredClone(plan);
  bad.package_manifest.artifacts[0].client_filename='Archive.zip';
  bad.package_manifest.artifacts[0].mime_type='application/zip';
  held(verdict({client_preview_filename:'Archive.zip',provider_attachment_proofs:[{client_filename:'Archive.zip',provider_readback:true,sha256:'sha256:'+SHA}]},{releasePlan:bad}), 'customer_preview_missing_or_unsupported');
});
test('attached PDF with unverified embedded owner-only Drive reference is held',()=>{
  held(verdict({references:[{url:'https://drive.google.com/file/d/fake/view',authorized_to_share:false,access_result:'owner_only'}]}),'supporting_reference_0_not_recipient_openable');
});
test('incomplete link inventory is held',()=>held(verdict({references_complete:false}), 'supporting_link_inventory_incomplete'));
test('restricted dependency is held',()=>held(verdict({restricted_dependency_count:1}), 'restricted_dependency_present'));
test('future and stale approvals fail closed',()=>{
  held(verdict({}, {now:TIME+30*60*1000+1}), 'verification_stale_or_missing');
  held(verdict({}, {now:TIME-6*60*1000}), 'verification_stale_or_missing');
});
test('absent verified shipping signature is held',()=>{
  const e=signed();delete e.signature;
  held(verifyRecipientAccess({plan,evidence:e,trusted_verifier_public_key:PUBLIC_KEY,now:TIME}), 'shipping_attestation_signature_missing');
});
test('changing recipient invalidates bound HMAC',()=>{
  const changed={...plan,recipient_ref:'different@example.invalid'};
  held(verifyRecipientAccess({plan:changed,evidence:signed(),trusted_verifier_public_key:PUBLIC_KEY,now:TIME}), 'shipping_signature_invalid_or_tampered');
});
test('changing package digest invalidates bound HMAC',()=>{
  const changed=structuredClone(plan);changed.package_manifest.package_digest='sha256:'+'e'.repeat(64);
  held(verifyRecipientAccess({plan:changed,evidence:signed(),trusted_verifier_public_key:PUBLIC_KEY,now:TIME}), 'shipping_signature_invalid_or_tampered');
});
test('changing chosen mode or link after signature invalidates HMAC',()=>{
  const e=signed();e.mode='external_public_link';
  held(verifyRecipientAccess({plan,evidence:e,trusted_verifier_public_key:PUBLIC_KEY,now:TIME}),'recipient_open_not_verified');
});
test('public Drive link with signed-out download matching preview hash passes access preflight',()=>{
  const e=signed({
    ...base,mode:'external_public_link',
    url:'https://drive.google.com/uc?export=download&id=example',
    recipient_open_verified:true,
    open_http_status:200,
    opened_content_sha256:'sha256:'+SHA,
    share_scope:'anyone_reader'
  });
  const out=verifyRecipientAccess({plan,evidence:e,trusted_verifier_public_key:PUBLIC_KEY,now:TIME});
  assert.equal(out.pass,true,JSON.stringify(out.reasons));
});
test('public Google Drive link with owner-only sharing is held',()=>{
  held(verdict({...base,mode:'external_public_link',url:'https://drive.google.com/file/d/example/view',recipient_open_verified:true,open_http_status:200,opened_content_sha256:SHA,share_scope:'owner_only'}),'public_viewer_permission_missing');
});
test('public link HTTP 200 but wrong bytes is held',()=>{
  held(verdict({...base,mode:'external_public_link',url:'https://example.com/file',recipient_open_verified:true,open_http_status:200,opened_content_sha256:'f'.repeat(64),share_scope:'anyone_reader'}),'recipient_open_bytes_not_verified');
});
test('signed-out HTML login shell cannot pass as recipient-opened PDF',()=>{
  held(verdict({...base,mode:'external_public_link',url:'https://example.com/file',recipient_open_verified:true,open_http_status:200,opened_content_sha256:null,share_scope:'anyone_reader'}),'recipient_open_bytes_not_verified');
});
test('scoped permission must bind exact intended recipient',()=>{
  held(verdict({...base,mode:'external_scoped_link',url:'https://example.com/file',recipient_open_verified:true,open_http_status:200,opened_content_sha256:SHA,share_scope:'recipient_scoped',verified_recipient_ref:'other@example.invalid'}),'scoped_recipient_permission_missing');
});
test('no human send authority never passes even with a good signature',()=>{
  const bad={...plan,authorization_ref:null};
  held(verdict({}, {releasePlan:bad}),'human_authorization_missing');
});
test('no send-capable channel never passes',()=>{
  const bad={...plan,channel_contract:{external_send:false}};
  held(verdict({}, {releasePlan:bad}),'not_external_delivery_channel');
});
test('unsupported mode never passes',()=>held(verdict({mode:'internal_archive'}),'unsupported_delivery_mode'));

test('Drive iPhone failure: raw .md mislabeled text/plain is never a customer preview',()=>{
  const bad=structuredClone(plan);
  bad.package_manifest.artifacts[0].client_filename='Mobile Handoff.md';
  bad.package_manifest.artifacts[0].mime_type='text/plain';
  held(verdict({
    client_preview_filename:'Mobile Handoff.md',
    provider_attachment_proofs:[{client_filename:'Mobile Handoff.md',provider_readback:true,sha256:'sha256:'+SHA}]
  },{releasePlan:bad}), 'customer_preview_missing_or_unsupported');
});
test('PDF MIME cannot camouflage a .zip or .html filename',()=>{
  for(const filename of ['Package.zip','Viewer.html']){
    const bad=structuredClone(plan);
    bad.package_manifest.artifacts[0].client_filename=filename;
    held(verdict({
      client_preview_filename:filename,
      provider_attachment_proofs:[{client_filename:filename,provider_readback:true,sha256:'sha256:'+SHA}]
    },{releasePlan:bad}), 'customer_preview_missing_or_unsupported');
  }
});
test('plain text .txt remains a supported, explicitly named preview',()=>{
  const ok=structuredClone(plan);
  ok.package_manifest.artifacts[0].client_filename='Summary.txt';
  ok.package_manifest.artifacts[0].mime_type='text/plain';
  assert.equal(verdict({
    client_preview_filename:'Summary.txt',
    provider_attachment_proofs:[{client_filename:'Summary.txt',provider_readback:true,sha256:'sha256:'+SHA}]
  },{releasePlan:ok}).pass,true);
});
test('a missing or non-array artifact inventory returns a HOLD without throwing',()=>{
  for(const artifacts of [[],{},null]){
    const bad=structuredClone(plan);
    bad.package_manifest.artifacts=artifacts;
    const result=verifyRecipientAccess({plan:bad,evidence:signed(),trusted_verifier_public_key:PUBLIC_KEY,now:TIME});
    held(result,'package_artifact_inventory_missing');
  }
});
test('duplicate artifact names remain HOLD even with provider proofs',()=>{
  const bad=structuredClone(plan);
  bad.package_manifest.artifacts.push({...bad.package_manifest.artifacts[0]});
  held(verdict({provider_attachment_proofs:[
    {...base.provider_attachment_proofs[0]},
    {...base.provider_attachment_proofs[0]}
  ]},{releasePlan:bad}), 'artifact_filenames_not_unique');
});
test('manifest entries missing client filename fail closed',()=>{
  const bad=structuredClone(plan);
  delete bad.package_manifest.artifacts[0].client_filename;
  held(verifyRecipientAccess({plan:bad,evidence:signed(),trusted_verifier_public_key:PUBLIC_KEY,now:TIME}), 'artifact_filename_missing');
});
test('completely absent plan returns HOLD rather than throwing',()=>{
  const out=verifyRecipientAccess({plan:null,evidence:signed(),trusted_verifier_public_key:PUBLIC_KEY,now:TIME});
  held(out,'release_plan_not_ready');
  assert.equal(out.boundary.provider_send_not_inferred,true);
});
