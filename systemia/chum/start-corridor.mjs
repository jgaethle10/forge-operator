const DEFAULT_MACHINE_COMMERCE_GATEWAY = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';

const BLOCKED_PUBLIC_HOSTS = new Set([
  'systemiacommandcenters.com',
  'www.systemiacommandcenters.com'
]);

export function machineReviewUrl(publicId, gateway = DEFAULT_MACHINE_COMMERCE_GATEWAY) {
  const id = String(publicId || '').trim();
  if (!id) return null;
  return gateway + '?view=service&public_id=' + encodeURIComponent(id);
}

export function configuredChumPublicOrigin(value = process.env.CHUM_PUBLIC_ORIGIN) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (BLOCKED_PUBLIC_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function humanStartUrl(offer, {
  surface = 'chum_public_surface',
  publicOrigin = process.env.CHUM_PUBLIC_ORIGIN,
  gateway = DEFAULT_MACHINE_COMMERCE_GATEWAY
} = {}) {
  if (offer?.commercial_state !== 'sell_now' || !offer?.public_id) return null;
  const origin = configuredChumPublicOrigin(publicOrigin);
  if (!origin) return machineReviewUrl(offer.public_id, gateway);
  return origin + '/api/chum/go/' + encodeURIComponent(String(offer.public_id))
    + '?surface=' + encodeURIComponent(String(surface || 'chum_public_surface'));
}

export function humanStartState(offer, {
  publicOrigin = process.env.CHUM_PUBLIC_ORIGIN
} = {}) {
  if (offer?.commercial_state !== 'sell_now' || !offer?.public_id) return 'not_sell_now';
  return configuredChumPublicOrigin(publicOrigin)
    ? 'tracked_chum_handoff_configured_origin'
    : 'machine_commerce_review_fallback';
}
