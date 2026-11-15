import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhotoObservation } from '../systemia/earth-pulse/photo-observation.mjs';
import { buildRepeatPhotoReviewQueue } from '../systemia/earth-pulse/repeat-review.mjs';

const photo = (hash, observedAt, options = {}) => normalizePhotoObservation({
  category: 'waterway',
  site_id: 'yakima-site-001',
  media: { sha256: hash.repeat(64), mime_type: 'image/jpeg' },
  location: { latitude: 46.6021, longitude: -120.5059 },
  received_at: '2026-11-15T20:00:00Z',
  observed_at: observedAt,
  ...options
});
const site = (p = {}) => ({
  id: 'yakima-site-001', category: 'waterway',
  region_cell: photo('a', '2026-11-12T09:00:00Z').region_cell,
  review_enabled: true, ...p
});

test('produces review-only repeat-photo pair for registered site', () => {
  const input = [photo('a', '2026-11-12T09:00:00Z'), photo('b', '2026-11-13T09:00:00Z')];
  const pairs = buildRepeatPhotoReviewQueue({observations: input, sites: [site()]});
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].observed_change, 'undetermined');
  assert.equal(pairs[0].publication_state, 'not_authorized');
  assert.equal(pairs[0].alert_eligible, false);
  assert.equal(pairs[0].review_state, 'site_and_viewpoint_alignment_required');
});

test('deduplicates repeat submissions of the same image', () => {
  const pairs = buildRepeatPhotoReviewQueue({ observations: [
    photo('a', '2026-11-12T09:00:00Z'),
    photo('a', '2026-11-13T09:00:00Z'),
    photo('b', '2026-11-14T09:00:00Z')
  ], sites: [site()] });
  assert.equal(pairs.length, 1);
});

test('requires explicit scoped site registration and matching region', () => {
  const observations = [photo('a', '2026-11-12T09:00:00Z'), photo('b', '2026-11-14T09:00:00Z')];
  assert.deepEqual(buildRepeatPhotoReviewQueue({ observations, sites: [] }), []);
  assert.deepEqual(buildRepeatPhotoReviewQueue({ observations, sites: [site({review_enabled: false})] }), []);
  assert.deepEqual(buildRepeatPhotoReviewQueue({ observations, sites: [site({region_cell: 'g10:0:0'})] }), []);
  assert.deepEqual(buildRepeatPhotoReviewQueue({ observations, sites: [site({category: 'habitat'})] }), []);
});

test('rejects duplicate registry sites and unnormalized observations', () => {
  assert.throws(() => buildRepeatPhotoReviewQueue({ sites: [site(), site()] }));
  assert.throws(() => buildRepeatPhotoReviewQueue({ observations: [{}] }));
});

test('different images with the same capture timestamp are not ordered as change', () => {
  const pairs = buildRepeatPhotoReviewQueue({observations: [
    photo('a', '2026-11-12T09:00:00Z'), photo('b', '2026-11-12T09:00:00Z')
  ], sites: [site()] });
  assert.equal(pairs.length, 0);
});
