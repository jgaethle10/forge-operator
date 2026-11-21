/**
 * ForensiScope / BEAST MODE delivery-route selector.
 * Planning only: cannot transmit bytes, send messages, create links or prove receipt.
 * Every candidate represents a separately verified authorized transport adapter.
 */
export const ADAPTIVE_DELIVERY_SCHEMA = 'evercraft.forensiscope.adaptive-delivery-plan.v1';
const KINDS = new Set(['direct_attachment', 'secure_link', 'verified_multipart', 'lossless_envelope', 'optimized_video']);
const DEFAULT_WEIGHT = Object.freeze({
  direct_attachment: 0,
  secure_link: 10,
  verified_multipart: 20,
  lossless_envelope: 30,
  optimized_video: 40,
});
const boolean = value => value === true;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const fail = key => { throw new Error(key); };
const clean = value => String(value ?? '').trim();

function validateAsset(asset) {
  if (!asset || !integer(asset.byte_count) || asset.byte_count === 0) fail('asset_byte_count_invalid');
  if (!clean(asset.filename)) fail('asset_filename_required');
  return {
    filename: clean(asset.filename),
    byte_count: asset.byte_count,
    mime_type: clean(asset.mime_type) || 'application/octet-stream',
    private: asset.private !== false,
  };
}

function validateRoute(raw, i) {
  const route = raw && typeof raw === 'object' ? raw : {};
  const id = clean(route.id);
  if (!id) fail('route_' + i + '_id_required');
  if (!KINDS.has(route.kind)) fail('route_' + i + '_kind_invalid');
  return { ...route, id };
}

function evaluateRoute(route, asset, { require_original, allow_lossy_conversion, recipient_authorized, failed_route_ids }) {
  const blockers = [];
  const blocked = reason => blockers.push(reason);
  if (failed_route_ids.includes(route.id)) blocked('previous_attempt_failed');
  if (!boolean(route.ready)) blocked('adapter_not_ready');
  if (!boolean(route.verified_transport)) blocked('transport_not_verified');
  if (!boolean(route.sender_compatible)) blocked('sender_not_supported');
  if (!boolean(route.recipient_compatible)) blocked('recipient_not_supported');
  if (!boolean(route.sender_authorized) || !recipient_authorized) blocked('external_send_not_authorized');
  if (!boolean(route.recipient_can_access)) blocked('recipient_access_unverified');
  if (!boolean(route.delivery_receipt_supported)) blocked('delivery_receipt_not_supported');
  if (asset.private && !boolean(route.private_transfer)) blocked('private_transport_required');

  const modified = route.kind === 'optimized_video';
  if (modified) {
    if (require_original) blocked('original_bytes_required');
    if (!allow_lossy_conversion || !boolean(route.sender_approved_conversion)) blocked('conversion_not_approved');
    if (!asset.mime_type.startsWith('video/')) blocked('not_a_video');
    if (!integer(route.expected_output_bytes) || route.expected_output_bytes === 0) blocked('converted_size_not_known');
    if (!boolean(route.recipient_accepts_derivative)) blocked('derivative_not_accepted');
  } else if (!boolean(route.byte_preserving) || !boolean(route.receiver_can_verify_sha256)) {
    blocked('lossless_round_trip_not_verified');
  }
  const size = modified && integer(route.expected_output_bytes) ? route.expected_output_bytes : asset.byte_count;
  let parts = null;
  if (route.kind === 'verified_multipart') {
    if (!integer(route.max_part_bytes) || route.max_part_bytes === 0) blocked('part_size_invalid');
    if (!integer(route.max_parts) || route.max_parts === 0) blocked('part_limit_invalid');
    if (!boolean(route.receiver_can_reassemble)) blocked('receiver_cannot_reassemble');
    if (integer(route.max_part_bytes) && route.max_part_bytes > 0) {
      parts = Math.ceil(size / route.max_part_bytes);
      if (integer(route.max_parts) && parts > route.max_parts) blocked('too_many_parts');
    }
  } else {
    if (!integer(route.max_file_bytes) || route.max_file_bytes === 0) blocked('file_limit_unknown');
    else if (size > route.max_file_bytes) blocked('file_exceeds_route_limit');
  }
  if (route.kind === 'lossless_envelope') {
    if (!boolean(route.carrier_preserves_bytes)) blocked('carrier_may_reencode');
    if (!boolean(route.receiver_has_unwrapper)) blocked('receiver_lacks_unwrapper');
    if (route.carrier_type === 'png' && !boolean(route.png_roundtrip_tested)) blocked('png_round_trip_not_tested');
  }
  if (modified && integer(route.max_file_bytes) && size > route.max_file_bytes) blocked('file_exceeds_route_limit');
  return {
    id: route.id,
    kind: route.kind,
    admissible: blockers.length === 0,
    blockers,
    parts,
    byte_count_to_send: size,
    original_preserved: !modified,
    // Preference is only a tiebreaker among proven, authorized options.
    score: DEFAULT_WEIGHT[route.kind] + (integer(route.preference_penalty) ? route.preference_penalty : 0),
  };
}

/**
 * An 'attemptable' plan requires a recipient-accessible transport but does not
 * claim the receiver actually got the file. That requires an independent receipt.
 */
export function planAdaptiveDelivery(input) {
  const asset = validateAsset(input?.asset);
  const policy = input?.policy ?? {};
  const require_original = policy.require_original !== false;
  const allow_lossy_conversion = boolean(policy.allow_lossy_conversion);
  const recipient_authorized = boolean(policy.recipient_authorized);
  const failed_route_ids = Array.isArray(input?.failed_route_ids) ? input.failed_route_ids.map(clean) : [];
  const routes = Array.isArray(input?.routes) ? input.routes.map(validateRoute) : [];
  const ids = new Set();
  for (const route of routes) {
    if (ids.has(route.id)) fail('duplicate_route_id:' + route.id);
    ids.add(route.id);
  }
  const evaluated = routes.map(route => evaluateRoute(route, asset, {
    require_original, allow_lossy_conversion, recipient_authorized, failed_route_ids
  }));
  const ranked = evaluated.filter(r => r.admissible).sort((a,b) => a.score - b.score || a.id.localeCompare(b.id));
  return {
    schema: ADAPTIVE_DELIVERY_SCHEMA,
    status: ranked.length ? 'READY_TO_ATTEMPT' : 'BLOCKED_NO_VERIFIED_ROUTE',
    asset,
    policy: { require_original, allow_lossy_conversion, recipient_authorized },
    selected: ranked[0] ?? null,
    alternates: ranked.slice(1),
    rejected: evaluated.filter(r => !r.admissible),
    recipient_delivery_verified: false,
    original_sha256_verified_at_receiver: false,
    notes: 'Route selection is not a transmission, link, or recipient receipt. A real adapter must complete the handoff and verify receipt independently.'
  };
}
