import { createPublicKey, verify as verifySignature } from 'node:crypto';

// Pre-send Shipping Department recipient-access verification.
// This module does not issue approvals, send email, set Drive permissions, or call Systemia.
// The runtime must obtain its signer key from a protected independent Shipping service.
const RECEIPT_VERIFIER = 'evercraft-independent-shipping-verifier-v1';
const MAX_AGE_MS = 30 * 60 * 1000;
const SHA = /^(?:sha256:)?[0-9a-f]{64}$/i;
// MIME alone is insufficient. Drive iOS can refuse an uploaded .md, ZIP or
// HTML artifact even when its content type was rewritten to a previewable one.
const PREVIEW_SUFFIXES = Object.freeze({
  'application/pdf':/\.pdf$/i,
  'image/png':/\.png$/i,
  'image/jpeg':/\.(?:jpg|jpeg)$/i,
  'text/plain':/\.txt$/i
});
function supportedCustomerPreview(artifact) {
  const mime = clean(artifact?.mime_type).toLowerCase();
  const filename = clean(artifact?.client_filename);
  return Boolean(filename && PREVIEW_SUFFIXES[mime]?.test(filename));
}

const clean = (value) => String(value ?? '').trim();
const normalizeHash = (value) => clean(value).toLowerCase().replace(/^sha256:/, '');

function canonical(value) {
  if (value === undefined) throw new Error('undefined_signed_claim');
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function shippingAttestationPayload({ plan, evidence }) {
  const { signature, ...signedEvidence } = evidence;
  const boundPlan = {
    release_key:plan.release_key,
    release_fingerprint:plan.release_fingerprint,
    recipient_ref:plan.recipient_ref,
    channel:plan.channel,
    package_digest:plan.package_manifest?.package_digest,
    artifacts:plan.package_manifest?.artifacts?.map((item) => ({
      client_filename:item.client_filename,
      sha256:item.sha256,
      mime_type:item.mime_type,
      size_bytes:item.size_bytes
    }))
  };
  return 'EVERCRAFT-SHIPPING-RECIPIENT-PREFLIGHT-V1\n' + canonical({ plan:boundPlan, evidence:signedEvidence });
}

function validateEvidence(plan, evidence, now) {
  const reasons = [];
  const reject = (condition, code) => { if (!condition) reasons.push(code); };
  reject(plan?.ready === true && plan?.package_manifest?.pass === true, 'release_plan_not_ready');
  reject(plan?.channel_contract?.external_send === true, 'not_external_delivery_channel');
  reject(Boolean(clean(plan?.authorization_ref)), 'human_authorization_missing');
  reject(Boolean(clean(plan?.recipient_ref)), 'recipient_missing');
  reject(SHA.test(clean(plan?.package_manifest?.package_digest)), 'package_digest_missing');
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    reasons.push('shipping_attestation_missing');
    return reasons;
  }
  reject(evidence.verifier_id === RECEIPT_VERIFIER, 'independent_verifier_identity_invalid');
  reject(/^[0-9a-f]{32}$/i.test(clean(evidence.nonce)), 'verification_nonce_invalid');
  const observedAt = Date.parse(clean(evidence.verified_at));
  reject(Number.isFinite(observedAt) && observedAt <= now + 5 * 60_000 && now - observedAt <= MAX_AGE_MS, 'verification_stale_or_missing');
  reject(evidence.references_complete === true, 'supporting_link_inventory_incomplete');
  reject(evidence.claims_reviewed === true, 'claims_review_missing');
  reject(Array.isArray(evidence.references), 'supporting_link_inventory_missing');
  if (Array.isArray(evidence.references)) for (const [i, ref] of evidence.references.entries()) {
    reject(ref?.authorized_to_share === true &&
      ['anonymous_open_verified', 'recipient_scoped_open_verified'].includes(ref?.access_result),
      'supporting_reference_' + i + '_not_recipient_openable');
  }
  reject(evidence.restricted_dependency_count === 0, 'restricted_dependency_present');

  // Malformed or ambiguous frozen manifests must return HOLD, never throw or
  // permit the first duplicate filename to stand in for a different artifact.
  const artifacts = Array.isArray(plan?.package_manifest?.artifacts)
    ? plan.package_manifest.artifacts : [];
  reject(artifacts.length > 0, 'package_artifact_inventory_missing');
  const names = artifacts.map((x) => clean(x?.client_filename));
  reject(names.every(Boolean), 'artifact_filename_missing');
  reject(new Set(names).size === names.length, 'artifact_filenames_not_unique');
  const preview = artifacts.find((x) => x?.client_filename === evidence.client_preview_filename);
  reject(supportedCustomerPreview(preview),
    'customer_preview_missing_or_unsupported');
  if (preview && ['application/pdf'].includes(clean(preview.mime_type).toLowerCase())) {
    reject(preview.render_verified === true, 'preview_render_unverified');
  }

  if (evidence.mode === 'external_attachment') {
    const proofs = evidence.provider_attachment_proofs;
    reject(Array.isArray(proofs), 'provider_attachment_readback_missing');
    if (Array.isArray(proofs)) {
      reject(proofs.length === artifacts.length, 'provider_attachment_count_mismatch');
      for (const [i, artifact] of artifacts.entries()) {
        const p = proofs.find((x) => x.client_filename === artifact.client_filename);
        reject(p?.provider_readback === true && normalizeHash(p?.sha256) === normalizeHash(artifact.sha256),
          'provider_attachment_' + i + '_hash_or_readback_mismatch');
      }
    }
  } else if (['external_public_link','external_scoped_link'].includes(evidence.mode)) {
    const url = clean(evidence.url);
    let parsed = null;
    try { parsed = new URL(url); } catch {}
    reject(parsed?.protocol === 'https:', 'recipient_https_url_required');
    reject(evidence.recipient_open_verified === true && evidence.open_http_status === 200, 'recipient_open_not_verified');
    reject(normalizeHash(evidence.opened_content_sha256) === normalizeHash(preview?.sha256),
      'recipient_open_bytes_not_verified');
    if (evidence.mode === 'external_public_link') {
      reject(evidence.share_scope === 'anyone_reader', 'public_viewer_permission_missing');
    } else {
      reject(evidence.share_scope === 'recipient_scoped' &&
        clean(evidence.verified_recipient_ref) === clean(plan?.recipient_ref),
        'scoped_recipient_permission_missing');
    }
  } else {
    reasons.push('unsupported_delivery_mode');
  }
  return [...new Set(reasons)];
}

export function verifyRecipientAccess({ plan, evidence, trusted_verifier_public_key, now = Date.now() } = {}) {
  const reasons = validateEvidence(plan, evidence, now);
  if (!clean(trusted_verifier_public_key)) reasons.push('trusted_verifier_public_key_not_configured');
  if (!/^[A-Za-z0-9_-]{80,120}$/.test(clean(evidence?.signature))) reasons.push('shipping_attestation_signature_missing');
  if (!reasons.length) {
    try {
      const trusted = createPublicKey(trusted_verifier_public_key);
      if (trusted.asymmetricKeyType !== 'ed25519') {
        reasons.push('shipping_verifier_key_type_untrusted');
      } else {
        const payload = Buffer.from(shippingAttestationPayload({plan,evidence}));
        const signature = Buffer.from(evidence.signature, 'base64url');
        if (signature.length !== 64 || !verifySignature(null, payload, trusted, signature)) {
          reasons.push('shipping_signature_invalid_or_tampered');
        }
      }
    } catch {
      reasons.push('shipping_signature_could_not_be_verified');
    }
  }
  return {
    schema:'evercraft.shipping.recipient-access-preflight.v1',
    status:reasons.length ? 'hold' : 'recipient_preflight_passed',
    pass:reasons.length === 0,
    reasons,
    boundary:{
      signed_by_independent_verifier_required:true,
      sender_may_not_sign_own_release:true,
      outbound_contact_gate_not_inferred:true,
      provider_send_not_inferred:true,
      delivery_not_inferred:true,
      customer_open_not_inferred_from_attachment:true
    }
  };
}
