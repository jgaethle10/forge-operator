import test from 'node:test';
import assert from 'node:assert/strict';
import { planAdaptiveDelivery } from './adaptive-delivery-planner.mjs';

const MiB = 1024 * 1024;
const asset = { filename: 'nikki-video.mov', mime_type: 'video/quicktime', byte_count: 120 * MiB, private: true };
const base = { ready: true, verified_transport: true, sender_compatible: true,
  recipient_compatible: true, sender_authorized: true, recipient_can_access: true,
  delivery_receipt_supported: true, private_transfer: true, byte_preserving: true,
  receiver_can_verify_sha256: true };
const policy = { require_original: true, recipient_authorized: true };
const direct = { ...base, id: 'sms', kind: 'direct_attachment', max_file_bytes: 25 * MiB };
const link = { ...base, id: 'owned-store', kind: 'secure_link', max_file_bytes: 300 * MiB };
const multipart = { ...base, id: 'football', kind: 'verified_multipart',
  max_part_bytes: 10 * MiB, max_parts: 20, receiver_can_reassemble: true };
const plan = (routes, extra={}) => planAdaptiveDelivery({ asset, routes, policy, ...extra });

test('chooses reachable link for 120 MiB video, not capped SMS; preserves exact original', () => {
  const result = plan([direct, multipart, link]);
  assert.equal(result.status, 'READY_TO_ATTEMPT');
  assert.equal(result.selected.id, 'owned-store');
  assert.equal(result.selected.original_preserved, true);
  assert.equal(result.alternates[0].parts, 12);
  assert.deepEqual(result.rejected[0].blockers, ['file_exceeds_route_limit']);
  assert.equal(result.recipient_delivery_verified, false);
});

test('chooses split / reassembly when link unavailable, without implying recipient delivery', () => {
  const result = plan([ { ...link, ready: false }, multipart ]);
  assert.equal(result.selected.id, 'football');
  assert.equal(result.selected.parts, 12);
  assert.equal(result.recipient_delivery_verified, false);
});

test('rejects PNG carrier when image service may strip bytes', () => {
  const png = { ...base, id: 'png', kind: 'lossless_envelope', max_file_bytes: 200 * MiB,
    carrier_type: 'png', carrier_preserves_bytes: false, receiver_has_unwrapper: true, png_roundtrip_tested: false };
  const result = plan([png]);
  assert.equal(result.selected, null);
  assert.ok(result.rejected[0].blockers.includes('carrier_may_reencode'));
  assert.ok(result.rejected[0].blockers.includes('png_round_trip_not_tested'));
});

test('rejects video conversion without explicit consent and prevents original downgrade', () => {
  const optimized = { ...base, id: 'transcoded', kind: 'optimized_video', max_file_bytes: 25 * MiB,
    expected_output_bytes: 18 * MiB, sender_approved_conversion: true, recipient_accepts_derivative: true };
  assert.equal(plan([optimized]).status, 'BLOCKED_NO_VERIFIED_ROUTE');
  const result = plan([optimized], { policy: { require_original: false, allow_lossy_conversion: true, recipient_authorized: true } });
  assert.equal(result.selected.original_preserved, false);
  assert.equal(result.selected.byte_count_to_send, 18 * MiB);
});

test('private videos require private transport and explicit recipient authority', () => {
  assert.equal(plan([{ ...link, private_transfer: false }]).selected, null);
  assert.equal(plan([link], { policy: { require_original: true, recipient_authorized: false } }).selected, null);
});

test('fails closed on unsupported recipient, missing receipt, or multipart reassembly', () => {
  const r=plan([{ ...link, recipient_compatible: false }, { ...multipart, receiver_can_reassemble: false }, { ...direct, delivery_receipt_supported: false }]);
  assert.equal(r.status, 'BLOCKED_NO_VERIFIED_ROUTE');
  assert.equal(r.rejected.length, 3);
});

test('replans after a failure and chooses an alternate proven route', () => {
  const r=plan([link,multipart],{failed_route_ids:['owned-store']});
  assert.equal(r.selected.id,'football');
  assert.ok(r.rejected[0].blockers.includes('previous_attempt_failed'));
});

test('rejects invalid metadata and duplicate identifiers', () => {
  assert.throws(() => planAdaptiveDelivery({ asset: { ...asset, byte_count: Infinity } }), /asset_byte_count_invalid/);
  assert.throws(() => plan([link, link]), /duplicate_route_id/);
});
