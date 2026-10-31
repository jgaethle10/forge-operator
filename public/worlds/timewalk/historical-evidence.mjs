/**
 * Evercraft Worlds Timewalk: data-only historical evidence adapter.
 *
 * This module does NOT render a world, geocode addresses, alter physics, or persist scenes.
 * Canonical Evercraft Worlds owns those operations. A year is not proof that visual
 * reconstructions are date-perfect. Only explicit source-linked claims are exposed.
 */
export const TIMEWALK_EVIDENCE_SCHEMA = 'evercraft.worlds.timewalk.evidence.v1';
export const TIMEWALK_OVERLAY_SCHEMA = 'evercraft.worlds.timewalk.overlay.v1';
const STATES = new Set(['documented','intervalInferred','illustrative','unresolved']);
const FORBIDDEN_EMBED_RIGHTS = new Set([
  'third_party_permission_check','publication_permission_required',
  'collection_specific_review','catalog_metadata_only','metadata_link_only'
]);
const assert = (condition, message) => { if (!condition) throw new Error(message); };

export function validateHistoricalEvidence(ledger) {
  assert(ledger && typeof ledger === 'object', 'Evidence must be an object');
  assert(ledger.schema === TIMEWALK_EVIDENCE_SCHEMA, 'Unsupported evidence schema');
  assert(typeof ledger.worldId === 'string' && ledger.worldId.length > 0, 'Missing worldId');
  assert(Number.isInteger(ledger.sceneYear), 'Invalid scene year');
  assert(ledger.location?.georeferenced === false && ledger.location?.crs === null,
    'This version must not assert precise georeference');
  assert(Array.isArray(ledger.sources) && ledger.sources.length > 0, 'No sources');
  const sources = new Map();
  for (const source of ledger.sources) {
    assert(typeof source.id === 'string' && !sources.has(source.id), 'Duplicate/invalid source ID');
    assert(/^https:\/\//.test(source.url || ''), 'Source must have HTTPS URL: ' + source.id);
    assert(source.rights && typeof source.rights.status === 'string',
      'Source rights classification missing: ' + source.id);
    sources.set(source.id, source);
  }
  assert(Array.isArray(ledger.places) && ledger.places.length > 0, 'No places');
  const places = new Set(), claims = new Set();
  for (const place of ledger.places) {
    assert(typeof place.id === 'string' && !places.has(place.id), 'Duplicate/invalid place ID');
    places.add(place.id);
    assert(Array.isArray(place.claims), 'Missing claims for ' + place.id);
    if (place.addressDiscrepancy?.status === 'unresolved') {
      assert(place.canonicalAddress === null,
        'Cannot assert canonical address with unresolved discrepancy: ' + place.id);
    }
    for (const claim of place.claims) {
      assert(typeof claim.id === 'string' && !claims.has(claim.id), 'Duplicate/invalid claim');
      claims.add(claim.id);
      assert(STATES.has(claim.evidence), 'Unknown evidence state: ' + claim.id);
      assert(typeof claim.assertion === 'string' && claim.assertion.length > 3, 'Empty claim');
      assert(Array.isArray(claim.sourceIds), 'Claim missing source list');
      for (const id of claim.sourceIds) assert(sources.has(id),
        'Claim ' + claim.id + ' references missing source ' + id);
      if (claim.evidence === 'documented') {
        assert(claim.sourceIds.length > 0, 'Documented claim must cite source: ' + claim.id);
      }
      if (claim.period === String(ledger.sceneYear)) {
        assert(claim.evidence !== 'documented',
          'Do not upgrade the target year without new direct evidence: ' + claim.id);
      }
    }
  }
  for (const candidate of ledger.researchInventory || []) {
    assert(sources.has(candidate.sourceId), 'Unresolved candidate source ' + candidate.sourceId);
    assert(candidate.id && candidate.acquisition, 'Incomplete research inventory record');
  }
  return ledger;
}

/** A source link is not an image license, regardless of catalog citation. */
export function sourceCanBeEmbedded(source) {
  if (!source || !source.rights) return false;
  if (FORBIDDEN_EMBED_RIGHTS.has(source.rights.status)) return false;
  // An individual image item, separate from its collection, must be reviewed.
  // 'public_domain_per_holding_institution' authorizes the online LOC Sanborn
  // collection, but not arbitrary third-party derivatives or copies.
  return source.rights.status === 'public_domain_per_holding_institution';
}

/**
 * Make a safe, serializable source overlay for a canonical Worlds scene.
 * Never generates fake geographic coordinates, geometry, tenants or 1960 photos.
 */
export function makeHistoricalOverlay(input, requestedYear = input?.sceneYear) {
  const ledger = validateHistoricalEvidence(input);
  assert(Number.isInteger(requestedYear) && requestedYear === ledger.sceneYear,
    'This alpha only has a sourced research profile for its selected year');
  const bySource = new Map(ledger.sources.map(s => [s.id,s]));
  const references = ledger.places.map(place => ({
    id:place.id,
    title:place.label,
    address:place.addressDiscrepancy?.status === 'unresolved' ? null : (place.canonicalAddress ?? null),
    addressStatus:place.addressDiscrepancy?.status || (place.canonicalAddress ? 'cited-address' : 'unverified'),
    claims:place.claims.map(claim => ({
      id:claim.id, description:claim.assertion, evidence:claim.evidence,
      period:claim.period,
      directTargetYearProof:claim.evidence === 'documented' && claim.period === String(requestedYear),
      // Original sources can be opened, but publishing media needs item-level review.
      citations:claim.sourceIds.map(id => ({
        sourceId:id,title:bySource.get(id).name,url:bySource.get(id).url,
        rights:bySource.get(id).rights.status
      })),
      uncertainty:claim.reason || null
    }))
  }));
  return {
    schema:TIMEWALK_OVERLAY_SCHEMA,
    canonicalRuntime:'evercraft-worlds',
    worldId:ledger.worldId,
    sceneYear:requestedYear,
    status:ledger.status,
    georeferenced:false,
    crs:null,
    geometry:null,
    movement:null,
    renderer:null,
    sourcesEmbedded:[],
    accurateSceneClaimAllowed:false,
    places:references,
    researchCandidates:(ledger.researchInventory || []).map(x => ({
      id:x.id,sourceId:x.sourceId,period:x.period.display,
      acquisition:x.acquisition,accuracyNote:x.useFor1960
    })),
    guardrails:(ledger.promotionGates || []).map(x => x.rule),
    warnings:[
      'Historical claims are not equivalent to verified 1960 3D geometry.',
      '1959 and 1961 directory holdings are cataloged; their contents have not been examined.',
      'Any licensed archival photograph requires item-level rights verification.',
      'This overlay provides data for the original Worlds runtime, not a second engine.'
    ]
  };
}
