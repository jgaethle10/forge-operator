import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhotoObservation, attachModelSuggestions, clusterPhotoObservations
} from '../systemia/earth-pulse/photo-observation.mjs';

const make = (extra = {}) => normalizePhotoObservation({
  category: 'waterway',
  media: { sha256: 'a'.repeat(64), mime_type: 'image/jpeg' },
  location: { latitude: 46.6021, longitude: -120.5059 },
  received_at: '2026-11-11T09:00:00Z',
  observed_at: '2026-11-11T08:00:00Z',
  ...extra
});

test('normalizes safely without exposing exact coordinates or contributor identity', () => {
  const item = make();
  assert.match(item.region_cell, /^g10:\d+:\d+$/);
  assert.equal(item.evidence_state, 'reported');
  assert.equal(item.publication_state, 'private');
  assert.equal(JSON.stringify(item).includes('46.6021'), false);
  assert.equal(JSON.stringify(item).includes('-120.5059'), false);
  assert.equal(item.observed_time_state, 'contributor_supplied_unverified');
});

test('publication requires consent and a subsequent privacy/rights review', () => {
  assert.equal(make({ public_share_consent: true }).publication_state,
    'pending_privacy_and_rights_review');
});

test('rejects malformed location, media, or timestamps', () => {
  assert.throws(() => make({ location: { latitude: 95, longitude: 0 } }));
  assert.throws(() => make({ media: { sha256: 'a', mime_type: 'image/jpeg' } }));
  assert.throws(() => make({ observed_at: '2026-11-12T08:00:00Z' }));
});

test('AI suggestions never become verified environmental facts', () => {
  const item = attachModelSuggestions(make(), [{ label: 'possible discoloration', confidence: 0.94 }]);
  assert.equal(item.evidence_state, 'reported');
  assert.equal(item.model_suggestions[0].status, 'unverified_model_hypothesis');
  assert.equal(item.review_state, 'unreviewed');
});

test('one repeatedly shared photo counts as one distinct visual source', () => {
  const dup = make({ received_at: '2026-11-11T10:00:00Z' });
  const clusters = clusterPhotoObservations([make(), dup]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].distinct_photo_count, 1);
  assert.equal(clusters[0].verification_state, 'requires_independent_review');
  assert.equal(clusters[0].environmental_condition, 'undetermined');
});

test('site IDs remain unverified contributor claims and reject unsafe names', () => {
  assert.equal(make({ site_id: 'yakima-site-001' }).site_claim_state, 'contributor_supplied_unverified');
  assert.throws(() => make({ site_id: '../../private' }));
});
