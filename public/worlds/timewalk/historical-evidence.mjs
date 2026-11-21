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

// Historical source matches must use administrative identity, never a street-name keyword.
const normalizedPlace = place => {
  assert(place && typeof place === 'object', 'Missing source jurisdiction');
  const city=String(place.city||'').trim().toLowerCase();
  const region=String(place.region||'').trim().toUpperCase();
  const country=String(place.country||'').trim().toUpperCase();
  assert(city && region && country, 'Incomplete source jurisdiction');
  return {city,region,country};
};
const sameJurisdiction = (a,b) => {
  const aa=normalizedPlace(a),bb=normalizedPlace(b);
  return aa.city===bb.city && aa.region===bb.region && aa.country===bb.country;
};
/** A 1960 claim can be promoted only after attaching individually reviewed dated evidence. */
export function isDirectTargetYearObservation(claim, ledger, sourceMap = new Map((ledger.sources||[]).map(s=>[s.id,s]))) {
  if (!claim || claim.period !== String(ledger.sceneYear) || claim.evidence !== 'documented') return false;
  const proof=claim.targetYearProof;
  if (!proof || typeof proof !== 'object' || !claim.sourceIds?.includes(proof.sourceId)) return false;
  const source=sourceMap.get(proof.sourceId);
  if (!source || !sameJurisdiction(source.targetJurisdiction,ledger.location.jurisdiction)) return false;
  if (!Array.isArray(source.evidencePeriod) || !source.evidencePeriod.some(x=>String(x)===(String(ledger.sceneYear)))) return false;
  if (!/^[0-9]{4}(?:-[0-9]{2}-[0-9]{2})?$/.test(String(proof.observationDate||''))) return false;
  if (Number(String(proof.observationDate).slice(0,4))!==ledger.sceneYear) return false;
  return typeof proof.itemLocator==='string' && proof.itemLocator.trim().length>=5 &&
    typeof proof.reviewNote==='string' && proof.reviewNote.trim().length>=12 &&
    proof.locationChecked === true && proof.originalItemInspected === true;
}

/** Collection licenses and item-level publication rights are separate checks. */
export function mediaAssetCanBeEmbedded(source, asset) {
  if (!source || !asset || asset.sourceId !== source.id || typeof asset.itemId !== 'string' ||
      asset.itemId.trim().length < 4 || typeof asset.credit !== 'string' ||
      asset.credit.trim().length < 4 || asset.reviewedForPublication !== true) return false;
  if (!String(asset.originalUrl||'').startsWith('https://')) return false;
  if (sourceCanBeEmbedded(source) && asset.itemRights === 'public-domain-verified') return true;
  return asset.itemRights === 'permission-granted' &&
    asset.explicitPermissionRecord === true;
}

export function validateHistoricalEvidence(ledger) {
  assert(ledger && typeof ledger === 'object', 'Evidence must be an object');
  assert(ledger.schema === TIMEWALK_EVIDENCE_SCHEMA, 'Unsupported evidence schema');
  assert(typeof ledger.worldId === 'string' && ledger.worldId.length > 0, 'Missing worldId');
  assert(Number.isInteger(ledger.sceneYear), 'Invalid scene year');
  assert(ledger.location?.georeferenced === false && ledger.location?.crs === null,
    'This version must not assert precise georeference');
  normalizedPlace(ledger.location.jurisdiction);
  assert(Array.isArray(ledger.sources) && ledger.sources.length > 0, 'No sources');
  const sources = new Map();
  for (const source of ledger.sources) {
    assert(typeof source.id === 'string' && !sources.has(source.id), 'Duplicate/invalid source ID');
    assert(/^https:\/\//.test(source.url || ''), 'Source must have HTTPS URL: ' + source.id);
    assert(source.rights && typeof source.rights.status === 'string',
      'Source rights classification missing: ' + source.id);
    assert(sameJurisdiction(source.targetJurisdiction,ledger.location.jurisdiction),
      'Source jurisdiction mismatch: ' + source.id);
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
      if (claim.period === String(ledger.sceneYear) && claim.evidence === 'documented') {
        assert(isDirectTargetYearObservation(claim,ledger,sources),
          'Do not upgrade the target year without inspected, located direct evidence: ' + claim.id);
      }
    }
  }
  for (const excluded of ledger.excludedSearchResults || []) {
    assert(excluded.allowedForScene === false &&
      !sameJurisdiction(excluded.sourceJurisdiction,ledger.location.jurisdiction),
      'Excluded source must be explicitly out of jurisdiction: ' + excluded.id);
    assert(!sources.has(excluded.id),
      'An excluded source cannot also be a cited source: ' + excluded.id);
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
      directTargetYearProof:isDirectTargetYearObservation(claim,ledger,bySource),
      // Original sources can be opened, but publishing media needs item-level review.
      citations:claim.sourceIds.map(id => ({
        sourceId:id,title:bySource.get(id).name,url:bySource.get(id).url,
        rights:bySource.get(id).rights.status
      })),
      uncertainty:claim.reason || null,
      directSourceItem:claim.targetYearProof ? {
        sourceId:claim.targetYearProof.sourceId,
        itemLocator:claim.targetYearProof.itemLocator,
        observationDate:claim.targetYearProof.observationDate
      } : null
    }))
  }));
  return {
    schema:TIMEWALK_OVERLAY_SCHEMA,
    canonicalRuntime:'evercraft-worlds',
    worldId:ledger.worldId,
    sceneYear:requestedYear,
    status:ledger.status,
    georeferenced:false,
    jurisdiction:structuredClone(ledger.location.jurisdiction),
    crs:null,
    geometry:null,
    movement:null,
    renderer:null,
    sourcesEmbedded:[],
    accurateSceneClaimAllowed:false,
    places:references,
    excludedSearchHits:(ledger.excludedSearchResults || []).map(x => ({
      id:x.id, sourceCity:x.sourceJurisdiction.city, reason:x.whyExcluded
    })),
    researchCandidates:(ledger.researchInventory || []).map(x => ({
      id:x.id,sourceId:x.sourceId,period:x.period.display,
      acquisition:x.acquisition,accuracyNote:x.useFor1960
    })),
    guardrails:(ledger.promotionGates || []).map(x => x.rule),
    warnings:[
      'Historical claims are not equivalent to verified 1960 3D geometry.',
      '1959 and 1961 directory holdings are cataloged; their contents have not been examined.',
      'Any licensed archival photograph requires item-level rights verification.',
      'Street-name matches outside the target city are excluded from historical evidence.',
      'This overlay provides data for the original Worlds runtime, not a second engine.'
    ]
  };
}
