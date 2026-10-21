/** Read-only CHUM snapshot audit. Never proves live checkout, paid revenue or delivery. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function auditRevenueRoutes(catalog, { now = new Date(), staleAfterHours = 48 } = {}) {
  if (!catalog || typeof catalog !== 'object' || !Array.isArray(catalog.offers)) {
    throw new TypeError('Expected a CHUM catalog object with offers[]');
  }
  if (!Number.isFinite(staleAfterHours) || staleAfterHours < 0) {
    throw new TypeError('staleAfterHours must be nonnegative');
  }
  const seen = new Set();
  const offers = catalog.offers.map((o, index) => {
    if (!o || typeof o.public_id !== 'string' || !o.public_id.trim()) {
      throw new TypeError('Missing public_id for offer ' + index);
    }
    if (seen.has(o.public_id)) throw new Error('Duplicate public_id: ' + o.public_id);
    seen.add(o.public_id);
    const sellNow = o.commercial_state === 'sell_now';
    const declaredHttpsStart = typeof o.start_url === 'string'
      && o.start_url.startsWith('https://')
      && o.start_url_state !== 'held_no_owned_public_origin';
    return {
      public_id: o.public_id,
      name: o.name ?? o.public_id,
      commercial_state: o.commercial_state ?? 'unknown',
      declared_start_state: o.start_url_state ?? 'unknown',
      declared_https_start: declaredHttpsStart,
      distribution_hold_in_snapshot: sellNow && !declaredHttpsStart,
    };
  });
  const updatedMs = Date.parse(catalog.updated_at ?? '');
  const asOfMs = now instanceof Date ? now.valueOf() : NaN;
  const validTimestamp = Number.isFinite(updatedMs) && Number.isFinite(asOfMs);
  const ageHours = validTimestamp ? Math.max(0, (asOfMs - updatedMs) / 3600000) : null;
  const stale = ageHours === null || ageHours > staleAfterHours;
  const sellNow = offers.filter(o => o.commercial_state === 'sell_now');
  const countMatches = catalog.count === undefined || catalog.count === offers.length;
  return {
    schema: 'evercraft.distribution.readonly-route-audit.v1',
    source_schema: catalog.schema ?? 'unknown',
    snapshot_updated_at: catalog.updated_at ?? null,
    snapshot_age_hours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
    snapshot_stale: stale,
    source_count_matches: countMatches,
    source_count: catalog.count ?? null,
    enumerated_count: offers.length,
    declared_sell_now_count: sellNow.length,
    declared_sell_now_https_start_count: sellNow.filter(o => o.declared_https_start).length,
    sell_now_without_declared_https_start_count: sellNow.filter(o => o.distribution_hold_in_snapshot).length,
    routes: offers.filter(o => o.distribution_hold_in_snapshot),
    live_http_verified: false,
    provider_checkout_verified: false,
    payment_verified: false,
    recommendation: stale || !countMatches
      ? 'REFRESH_AND_RECONCILE_WITH_LIVE_CATALOG_BEFORE_DISTRIBUTION'
      : 'LIVE_EXTERNAL_ROUTE_AND_PROVIDER_CANARIES_STILL_REQUIRED',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const filename = resolve(process.argv[2] || 'public/chum/sell-now.json');
    const catalog = JSON.parse(readFileSync(filename, 'utf8'));
    process.stdout.write(JSON.stringify(auditRevenueRoutes(catalog), null, 2) + '\n');
  } catch (error) {
    console.error('Revenue route audit failed: ' + error.message);
    process.exitCode = 1;
  }
}
