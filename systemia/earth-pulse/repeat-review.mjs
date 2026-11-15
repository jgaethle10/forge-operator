import { createHash } from 'node:crypto';

// Offline, reviewer-only pairing. This cannot assess image similarity, assign
// a condition score, authorize a site, publish, or send a Sentinel alert.
const SCHEMA = 'evercraft.earth-pulse.photo-observation.v0';
const SITE_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;

function idFor(parts) {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
}

export function buildRepeatPhotoReviewQueue({ observations = [], sites = [] } = {}) {
  if (!Array.isArray(observations) || !Array.isArray(sites) ||
      observations.length > 10000 || sites.length > 1000) {
    throw new TypeError('bounded observation and site arrays required');
  }

  const registry = new Map();
  for (const site of sites) {
    if (!site || typeof site.id !== 'string' || !SITE_ID.test(site.id) ||
        typeof site.category !== 'string' || typeof site.region_cell !== 'string' ||
        registry.has(site.id)) throw new TypeError('invalid or duplicate site registration');
    // A registry entry permits review, not proof of an upload's position.
    if (site.review_enabled === true) registry.set(site.id, site);
  }

  const candidates = new Map();
  for (const item of observations) {
    if (item?.schema !== SCHEMA) throw new TypeError('normalized photo observation required');
    const site = registry.get(item.site_id);
    if (!site || item.category !== site.category || item.region_cell !== site.region_cell ||
        !item.observed_at || item.evidence_state !== 'reported' ||
        !/^[a-f0-9]{64}$/.test(item.media_sha256)) continue;
    const when = Date.parse(item.observed_at);
    if (!Number.isFinite(when)) continue;
    if (!candidates.has(site.id)) candidates.set(site.id, new Map());
    const hashes = candidates.get(site.id);
    const existing = hashes.get(item.media_sha256);
    if (!existing || when < existing.when) hashes.set(item.media_sha256, { item, when });
  }

  const pairs = [];
  for (const [siteId, distinct] of candidates) {
    const chronological = [...distinct.values()].sort((a, b) =>
      a.when - b.when || a.item.observation_id.localeCompare(b.item.observation_id));
    for (let i = 1; i < chronological.length; i++) {
      const before = chronological[i - 1];
      const after = chronological[i];
      if (before.when === after.when) continue;
      pairs.push({
        schema: 'evercraft.earth-pulse.repeat-review.v0',
        pair_id: 'eorp:' + idFor([siteId, before.item.media_sha256, after.item.media_sha256]),
        site_id: siteId,
        region_cell: before.item.region_cell,
        category: before.item.category,
        before_observation_id: before.item.observation_id,
        after_observation_id: after.item.observation_id,
        before_claimed_at: before.item.observed_at,
        after_claimed_at: after.item.observed_at,
        review_state: 'site_and_viewpoint_alignment_required',
        observed_change: 'undetermined',
        environmental_condition: 'undetermined',
        publication_state: 'not_authorized',
        alert_eligible: false
      });
    }
  }
  return pairs.sort((a, b) => a.site_id.localeCompare(b.site_id) ||
    a.before_claimed_at.localeCompare(b.before_claimed_at) || a.pair_id.localeCompare(b.pair_id));
}
