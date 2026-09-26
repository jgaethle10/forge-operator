const DEFAULT_MACHINE_COMMERCE_GATEWAY = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';

const BLOCKED_PUBLIC_HOSTS = new Set([
  'systemiacommandcenters.com',
  'www.systemiacommandcenters.com'
]);

export const DIRECT_HUMAN_BUYER_DESTINATIONS = Object.freeze({
  'career-command-interview-practice-machine-v1': 'https://evercraft-career-command.base44.app/',
  'aliev-site-opportunity-snapshot-v1': 'https://aliev.base44.app/',
  'rivet-site-underwriting-v1': 'https://rivet.base44.app/',
  'findmypart-paid-hunt-v1': 'https://findmypart.base44.app/?offer=quick-hunt',
  'audit-center-website-audit-machine-v1': 'https://systemia-audit-pro.base44.app/',
  'website-launch-service-v1': 'https://instant-website-builder-usa-6feac193.base44.app/',
  'faie-signal-brief-v1': 'https://faie.base44.app/',
  'eventwave-paid-promotion-v1': 'https://event-wave.base44.app/',
  'roasted-text-pressure-test-machine-v1': 'https://get-roasted-hub.base44.app/',
  'ibmi-rescue-v1': 'https://findmypart.base44.app/ibmi-rescue',
  'deck-capital-fit-sprint-machine-v1': 'https://systemia-audit-pro.base44.app/services/capital-fit-sprint',
  'foundry-app-escape-audit-v1': 'https://systemia-audit-pro.base44.app/services/app-escape-audit',
  'site-survive-rapid-audit-v1': 'https://systemia-audit-pro.base44.app/services/site-survive'
});

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

export function directHumanBuyerUrl(offer, { surface = 'chum_public_surface' } = {}) {
  if (offer?.commercial_state !== 'sell_now' || !offer?.public_id) return null;
  const destination = DIRECT_HUMAN_BUYER_DESTINATIONS[String(offer.public_id)] || '';
  if (!destination) return null;
  try {
    const url = new URL(destination);
    if (url.protocol !== 'https:') return null;
    url.searchParams.set('src', 'chum');
    url.searchParams.set('campaign', 'buyer-frontage');
    url.searchParams.set('ec_surface', String(surface || 'chum_public_surface'));
    url.searchParams.set('ec_public_id', String(offer.public_id));
    return url.toString();
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
  if (origin) {
    return origin + '/api/chum/go/' + encodeURIComponent(String(offer.public_id))
      + '?surface=' + encodeURIComponent(String(surface || 'chum_public_surface'));
  }

  const direct = directHumanBuyerUrl(offer, { surface });
  if (direct) return direct;

  return machineReviewUrl(offer.public_id, gateway);
}

export function humanStartState(offer, {
  publicOrigin = process.env.CHUM_PUBLIC_ORIGIN
} = {}) {
  if (offer?.commercial_state !== 'sell_now' || !offer?.public_id) return 'not_sell_now';
  if (configuredChumPublicOrigin(publicOrigin)) return 'tracked_chum_handoff_configured_origin';
  if (DIRECT_HUMAN_BUYER_DESTINATIONS[String(offer.public_id)]) return 'direct_human_buyer_destination';
  return 'machine_commerce_review_fallback';
}
