import crypto from 'node:crypto';
import policy from './policy.json' with { type: 'json' };

const MAX_TAGS = 100;
const SAFE_TEXT = 240;

const toText = (value, max = SAFE_TEXT) => String(value ?? '').trim().slice(0, max);

const uniq = (values = []) =>
  [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => toText(value).toLowerCase())
    .filter(Boolean))]
    .slice(0, MAX_TAGS);

const cleanGeo = (geo = {}) => ({
  city: toText(geo.city, 120) || null,
  region: toText(geo.region, 120) || null,
  country: toText(geo.country, 120) || null,
  remote_ok: Boolean(geo.remote_ok),
});

const overlap = (a = [], b = []) => {
  const right = new Set(uniq(b));
  return uniq(a).filter((item) => right.has(item));
};

const canonical = (value) => JSON.stringify(value, Object.keys(value || {}).sort());

const sha256 = (value) =>
  crypto.createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');

export const CREATOR_COVENANT_VERSION = policy.version;

export function buildPublicListing(input = {}) {
  const ownerId = toText(input.owner_id || input.actor_id, 180);
  if (!ownerId) throw new Error('owner_id is required');

  return {
    schema: 'evercraft.opportunity-fabric.public-listing.v1',
    listing_id: toText(input.listing_id, 180) || crypto.randomUUID(),
    owner_id: ownerId,
    title: toText(input.title, 180) || 'Untitled opportunity',
    summary: toText(input.summary, 500),
    asset_types: uniq(input.asset_types),
    offers: uniq(input.offers),
    needs: uniq(input.needs),
    capabilities: uniq(input.capabilities),
    categories: uniq(input.categories),
    collaboration_modes: uniq(input.collaboration_modes),
    production_methods: uniq(input.production_methods),
    capacity_tags: uniq(input.capacity_tags),
    budget_band: toText(input.budget_band, 80) || null,
    timeline_band: toText(input.timeline_band, 80) || null,
    geography: cleanGeo(input.geography),
    protected_material_present: Boolean(input.protected_material_present),
    protected_material_disclosed: false,
    rights: {
      owner_asserted: true,
      ownership_transferred_by_listing: false,
      commercial_license_granted_by_listing: false,
    },
  };
}

function scorePair(a, b) {
  const aOffersToBNeeds = overlap(a.offers, b.needs);
  const bOffersToANeeds = overlap(b.offers, a.needs);
  const capabilityFit = [
    ...overlap(a.capabilities, b.needs),
    ...overlap(b.capabilities, a.needs),
  ];
  const categoryFit = overlap(a.categories, b.categories);
  const methodFit = overlap(a.production_methods, b.production_methods);
  const modeFit = overlap(a.collaboration_modes, b.collaboration_modes);

  const sameCity =
    a.geography?.city &&
    b.geography?.city &&
    a.geography.city.toLowerCase() === b.geography.city.toLowerCase();
  const sameRegion =
    a.geography?.region &&
    b.geography?.region &&
    a.geography.region.toLowerCase() === b.geography.region.toLowerCase();
  const remoteFit = Boolean(a.geography?.remote_ok && b.geography?.remote_ok);

  const score =
    aOffersToBNeeds.length * 30 +
    bOffersToANeeds.length * 30 +
    capabilityFit.length * 18 +
    categoryFit.length * 8 +
    methodFit.length * 8 +
    modeFit.length * 6 +
    (sameCity ? 14 : sameRegion ? 8 : remoteFit ? 4 : 0);

  return {
    score,
    evidence: {
      a_offers_to_b_needs: aOffersToBNeeds,
      b_offers_to_a_needs: bOffersToANeeds,
      capability_fit: [...new Set(capabilityFit)],
      category_fit: categoryFit,
      production_method_fit: methodFit,
      collaboration_mode_fit: modeFit,
      geography_fit: sameCity ? 'same_city' : sameRegion ? 'same_region' : remoteFit ? 'remote' : 'none',
    },
  };
}

export function matchOpportunities(rawListings = [], options = {}) {
  const listings = rawListings.map(buildPublicListing);
  const minimumScore = Number.isFinite(Number(options.minimum_score))
    ? Number(options.minimum_score)
    : 20;
  const matches = [];

  for (let i = 0; i < listings.length; i += 1) {
    for (let j = i + 1; j < listings.length; j += 1) {
      const left = listings[i];
      const right = listings[j];
      if (left.owner_id === right.owner_id) continue;

      const result = scorePair(left, right);
      if (result.score < minimumScore) continue;

      matches.push({
        schema: 'evercraft.opportunity-fabric.match.v1',
        match_id: sha256([left.listing_id, right.listing_id].sort().join('|')).slice(0, 24),
        score: result.score,
        parties: [
          { listing_id: left.listing_id, owner_id: left.owner_id, title: left.title },
          { listing_id: right.listing_id, owner_id: right.owner_id, title: right.title },
        ],
        evidence: result.evidence,
        protected_material_disclosed: false,
        next_action: 'request_protected_disclosure_only_if_both_parties_want_to_evaluate_further',
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score || a.match_id.localeCompare(b.match_id));
}

export function evaluateDisclosureGate({
  asset = {},
  recipient = {},
  agreement = {},
  owner_approval = {},
  verified_context = {},
} = {}) {
  const failures = [];

  const assetId = toText(asset.asset_id, 180);
  const ownerId = toText(asset.owner_id, 180);
  const recipientId = toText(recipient.recipient_id || recipient.id, 180);
  const purpose = toText(agreement.purpose, 120);

  if (!assetId) failures.push('asset_id_required');
  if (!ownerId) failures.push('owner_id_required');
  if (!recipientId) failures.push('recipient_id_required');
  if (!verified_context.recipient_identity_verified) failures.push('recipient_identity_not_verified');
  if (!verified_context.owner_identity_verified) failures.push('owner_identity_not_verified');
  if (!agreement.accepted) failures.push('creator_covenant_not_accepted');
  if (agreement.version !== policy.version) failures.push('creator_covenant_version_mismatch');
  if (!toText(agreement.accepted_at, 80)) failures.push('agreement_acceptance_timestamp_required');
  if (!purpose) failures.push('purpose_required');
  if (!policy.default_evaluation_license.allowed.includes(purpose)) failures.push('purpose_not_allowed_by_default_license');
  if (!owner_approval.approved) failures.push('owner_approval_required');
  if (toText(owner_approval.owner_id, 180) !== ownerId) failures.push('owner_approval_identity_mismatch');
  if (!toText(owner_approval.approved_at, 80)) failures.push('owner_approval_timestamp_required');

  return {
    authorized: failures.length === 0,
    failures,
    policy_version: policy.version,
    permitted_purpose: failures.length === 0 ? purpose : null,
  };
}

export function requireCollaborationAllocation(allocation = {}) {
  const required = policy.collaboration.pre_creation_allocation_fields;
  const missing = required.filter((field) => !toText(allocation[field], 500));
  return {
    authorized_to_begin_joint_creation: missing.length === 0 && allocation.accepted === true,
    missing: allocation.accepted === true ? missing : ['mutual_acceptance', ...missing],
    policy_version: policy.version,
  };
}

export function createDisclosureReceipt({
  asset,
  recipient,
  agreement,
  owner_approval,
  disclosed_at = new Date().toISOString(),
} = {}) {
  const assetFingerprint =
    toText(asset.asset_fingerprint, 128) ||
    sha256(asset.protected_content ?? asset.content ?? asset.asset_id ?? '');

  const receiptCore = {
    schema: 'evercraft.opportunity-fabric.disclosure-receipt.v1',
    asset_id: toText(asset.asset_id, 180),
    asset_fingerprint: assetFingerprint,
    owner_id: toText(asset.owner_id, 180),
    recipient_id: toText(recipient.recipient_id || recipient.id, 180),
    purpose: toText(agreement.purpose, 120),
    agreement_version: agreement.version,
    agreement_accepted_at: toText(agreement.accepted_at, 80),
    owner_approved_at: toText(owner_approval.approved_at, 80),
    disclosed_at: toText(disclosed_at, 80),
  };

  return {
    ...receiptCore,
    receipt_id: sha256(receiptCore),
    tamper_evidence: 'sha256',
    digitally_signed: false,
    production_signature_required: Boolean(policy.receipt.digital_signature_required_for_production),
  };
}

export function revealProtectedAsset({
  asset = {},
  recipient = {},
  agreement = {},
  owner_approval = {},
  verified_context = {},
  disclosed_at,
} = {}) {
  const gate = evaluateDisclosureGate({
    asset,
    recipient,
    agreement,
    owner_approval,
    verified_context,
  });

  if (!gate.authorized) {
    return {
      schema: 'evercraft.opportunity-fabric.disclosure-denial.v1',
      authorized: false,
      failures: gate.failures,
      policy_version: gate.policy_version,
      protected_material_disclosed: false,
    };
  }

  const receipt = createDisclosureReceipt({
    asset,
    recipient,
    agreement,
    owner_approval,
    disclosed_at,
  });

  return {
    schema: 'evercraft.opportunity-fabric.disclosure.v1',
    authorized: true,
    policy_version: gate.policy_version,
    permitted_purpose: gate.permitted_purpose,
    protected_material_disclosed: true,
    rights: {
      ownership_transferred: false,
      commercial_license_granted: false,
      use_limited_to: gate.permitted_purpose,
      ai_training_allowed: false,
      redisclosure_allowed: false,
    },
    protected_content: asset.protected_content ?? asset.content ?? null,
    receipt,
  };
}

export { policy as opportunityFabricPolicy };
