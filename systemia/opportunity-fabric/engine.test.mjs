import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPublicListing,
  matchOpportunities,
  evaluateDisclosureGate,
  revealProtectedAsset,
  requireCollaborationAllocation,
  CREATOR_COVENANT_VERSION,
  opportunityFabricPolicy,
} from './engine.mjs';

test('public listings never expose protected creative material', () => {
  const listing = buildPublicListing({
    listing_id: 'design-collection',
    owner_id: 'designer-1',
    title: '300 apparel designs',
    summary: 'Finished apparel artwork seeking production or licensing partner',
    asset_types: ['vector artwork'],
    offers: ['apparel designs', 'licensable artwork'],
    needs: ['screen printing', 'dtg printing', 'retail distribution'],
    categories: ['apparel'],
    collaboration_modes: ['production partner', 'licensing'],
    geography: { city: 'Yakima', region: 'Washington', country: 'US' },
    protected_material_present: true,
    protected_content: 'SECRET VECTOR ART',
    design_files: ['secret.ai'],
    source_bytes: 'do-not-leak',
  });

  assert.equal(listing.protected_material_present, true);
  assert.equal(listing.protected_material_disclosed, false);
  assert.equal('protected_content' in listing, false);
  assert.equal('design_files' in listing, false);
  assert.equal('source_bytes' in listing, false);
  assert.equal(listing.rights.ownership_transferred_by_listing, false);
  assert.equal(listing.rights.commercial_license_granted_by_listing, false);
});

test('matching can connect complementary partners using metadata only', () => {
  const matches = matchOpportunities([
    {
      listing_id: 'designer',
      owner_id: 'designer-1',
      title: 'Apparel design catalog',
      offers: ['apparel designs'],
      needs: ['screen printing'],
      categories: ['apparel'],
      collaboration_modes: ['production partner'],
      geography: { city: 'Yakima', region: 'Washington', country: 'US' },
      protected_material_present: true,
      protected_content: 'SECRET',
    },
    {
      listing_id: 'printer',
      owner_id: 'printer-1',
      title: 'Regional print capacity',
      offers: ['screen printing'],
      needs: ['apparel designs'],
      categories: ['apparel'],
      collaboration_modes: ['production partner'],
      geography: { city: 'Yakima', region: 'Washington', country: 'US' },
    },
  ]);

  assert.equal(matches.length, 1);
  assert.ok(matches[0].score >= 60);
  assert.equal(matches[0].protected_material_disclosed, false);
  assert.equal(JSON.stringify(matches).includes('SECRET'), false);
});

test('protected material is denied unless identity, covenant, purpose, and owner approval all pass', () => {
  const result = revealProtectedAsset({
    asset: {
      asset_id: 'song-demo-7',
      owner_id: 'artist-1',
      protected_content: 'UNRELEASED DEMO',
    },
    recipient: { recipient_id: 'studio-9' },
    agreement: {
      accepted: true,
      version: CREATOR_COVENANT_VERSION,
      accepted_at: '2026-09-26T23:00:00.000Z',
      purpose: 'assess_collaboration_fit',
    },
    owner_approval: {
      approved: false,
      owner_id: 'artist-1',
      approved_at: '',
    },
    verified_context: {
      recipient_identity_verified: true,
      owner_identity_verified: true,
    },
  });

  assert.equal(result.authorized, false);
  assert.equal(result.protected_material_disclosed, false);
  assert.equal('protected_content' in result, false);
  assert.ok(result.failures.includes('owner_approval_required'));
});

test('accepted evaluation disclosure preserves ownership and emits a receipt', () => {
  const result = revealProtectedAsset({
    asset: {
      asset_id: 'song-demo-7',
      owner_id: 'artist-1',
      protected_content: 'UNRELEASED DEMO',
    },
    recipient: { recipient_id: 'studio-9' },
    agreement: {
      accepted: true,
      version: CREATOR_COVENANT_VERSION,
      accepted_at: '2026-09-26T23:00:00.000Z',
      purpose: 'assess_collaboration_fit',
    },
    owner_approval: {
      approved: true,
      owner_id: 'artist-1',
      approved_at: '2026-09-26T23:01:00.000Z',
    },
    verified_context: {
      recipient_identity_verified: true,
      owner_identity_verified: true,
    },
    disclosed_at: '2026-09-26T23:02:00.000Z',
  });

  assert.equal(result.authorized, true);
  assert.equal(result.protected_content, 'UNRELEASED DEMO');
  assert.equal(result.rights.ownership_transferred, false);
  assert.equal(result.rights.commercial_license_granted, false);
  assert.equal(result.rights.ai_training_allowed, false);
  assert.equal(result.rights.redisclosure_allowed, false);
  assert.equal(result.receipt.asset_id, 'song-demo-7');
  assert.equal(result.receipt.owner_id, 'artist-1');
  assert.equal(result.receipt.recipient_id, 'studio-9');
  assert.equal(result.receipt.agreement_version, CREATOR_COVENANT_VERSION);
  assert.equal(result.receipt.receipt_id.length, 64);
  assert.equal(JSON.stringify(result.receipt).includes('UNRELEASED DEMO'), false);
});

test('default license rejects commercial production and AI training purposes', () => {
  for (const purpose of ['commercial_production', 'ai_training']) {
    const gate = evaluateDisclosureGate({
      asset: { asset_id: 'asset-1', owner_id: 'owner-1' },
      recipient: { recipient_id: 'recipient-1' },
      agreement: {
        accepted: true,
        version: CREATOR_COVENANT_VERSION,
        accepted_at: '2026-09-26T23:00:00.000Z',
        purpose,
      },
      owner_approval: {
        approved: true,
        owner_id: 'owner-1',
        approved_at: '2026-09-26T23:01:00.000Z',
      },
      verified_context: {
        recipient_identity_verified: true,
        owner_identity_verified: true,
      },
    });

    assert.equal(gate.authorized, false);
    assert.ok(gate.failures.includes('purpose_not_allowed_by_default_license'));
  }

  assert.ok(opportunityFabricPolicy.default_evaluation_license.prohibited_without_separate_explicit_license.includes('ai_training'));
  assert.ok(opportunityFabricPolicy.default_evaluation_license.prohibited_without_separate_explicit_license.includes('commercial_production'));
});

test('joint creation cannot begin until ownership and economics are allocated', () => {
  const incomplete = requireCollaborationAllocation({
    accepted: true,
    background_ip_owner: 'artist-1',
    new_work_ownership: 'joint',
  });
  assert.equal(incomplete.authorized_to_begin_joint_creation, false);
  assert.ok(incomplete.missing.includes('revenue_split'));

  const complete = requireCollaborationAllocation({
    accepted: true,
    background_ip_owner: 'artist-1',
    new_work_ownership: 'joint',
    license_scope: 'master recording and promotional use',
    revenue_split: '50/50 net master receipts',
    credit: 'artist and producer credited',
    territory: 'worldwide',
    duration: '5 years',
    derivative_rights: 'mutual written approval',
  });
  assert.equal(complete.authorized_to_begin_joint_creation, true);
  assert.deepEqual(complete.missing, []);
});
