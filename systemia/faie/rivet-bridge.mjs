import crypto from 'node:crypto';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function unique(values, limit = 100) {
  return [...new Set((values || []).map(clean).filter(Boolean))].slice(0, limit);
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

function evidenceState(value) {
  const state = clean(value).toLowerCase();
  if (state === 'verified') return 'verified';
  if (state === 'observed') return 'observed';
  if (state === 'modeled') return 'modeled';
  return 'reported';
}

function deriveRegionKeys(snapshot, explicit = []) {
  const keys = unique(explicit, 50);
  if (keys.length) return keys;
  const state = clean(snapshot?.state).toLowerCase();
  const postal = clean(snapshot?.postal_code);
  if (state) keys.push('state:' + state);
  if (postal) keys.push('zip:' + postal);
  return keys.length ? keys : ['global'];
}

function sourceRefs(snapshot, extras = []) {
  const candidates = [
    snapshot?.traffic_source_url,
    ...(list(snapshot?.source_record_ids)),
    ...extras
  ];
  return unique(candidates, 100);
}

function observation({
  snapshot,
  regionKeys,
  observedAt,
  kind,
  domains,
  summary,
  facts,
  provenanceRefs
}) {
  const fingerprint = [
    kind,
    regionKeys,
    observedAt,
    facts
  ];
  return {
    observation_id: 'rivet-faie:' + stableHash(fingerprint),
    source_system: 'rivet',
    source_family: 'RIVET / AliEV site intelligence',
    observed_at: observedAt,
    region_keys: regionKeys,
    domains,
    kind,
    evidence_state: evidenceState(snapshot?.evidence_state),
    reliability: 0.68,
    anomaly_score: 0,
    summary,
    provenance_refs: provenanceRefs,
    facts,
    metadata: {
      bridge: 'rivet_to_faie',
      response_profile: clean(snapshot?.response_profile) || null,
      source_snapshot_retrieved_at: clean(snapshot?.retrieved_at) || null,
      source_snapshot_preserved_by_rivet: true,
      ev_specific_fields_excluded: true
    }
  };
}

export function rivetSnapshotToFaieObservations(snapshot = {}, {
  regionKeys = [],
  observedAt = null
} = {}) {
  const regions = deriveRegionKeys(snapshot, regionKeys);
  const when = clean(observedAt || snapshot?.retrieved_at || snapshot?.generated_at) || new Date().toISOString();
  const rows = [];

  const utilityRates = [
    ...list(snapshot?.utility_rate_candidates),
    ...list(snapshot?.california_candidate_tariff_catalog),
    ...list(snapshot?.washington_pacific_power_current_rate_catalog)
  ];
  const utilityAreas = [
    ...list(snapshot?.utility_service_area_candidates),
    ...list(snapshot?.washington_utility_service_area_candidates),
    ...list(snapshot?.california_utility_service_area_candidates)
  ];
  if (utilityRates.length || utilityAreas.length) {
    rows.push(observation({
      snapshot,
      regionKeys: regions,
      observedAt: when,
      kind: 'site_utility_context',
      domains: ['energy', 'infrastructure'],
      summary: 'RIVET site intelligence contains utility service-area or tariff evidence relevant to physical infrastructure diligence.',
      provenanceRefs: sourceRefs(snapshot),
      facts: {
        utility_rate_candidate_count: utilityRates.length,
        utility_service_area_candidate_count: utilityAreas.length,
        utility_rate_source_status: clean(snapshot?.utility_rate_source_status) || null,
        washington_service_area_status: clean(snapshot?.washington_utility_service_area_status) || null,
        california_service_area_status: clean(snapshot?.california_service_area_status) || null,
        semantics: 'Candidate utility and tariff evidence requires site-specific confirmation before consequential use.'
      }
    }));
  }

  const freight = list(snapshot?.freight_context);
  const traffic = list(snapshot?.traffic);
  if (freight.length || traffic.length) {
    rows.push(observation({
      snapshot,
      regionKeys: regions,
      observedAt: when,
      kind: 'site_transport_logistics_context',
      domains: ['transport', 'supply_chain', 'infrastructure'],
      summary: 'RIVET site intelligence contains transport or freight evidence relevant to logistics diligence.',
      provenanceRefs: sourceRefs(snapshot),
      facts: {
        freight_record_count: freight.length,
        traffic_record_count: traffic.length,
        traffic_source_status: clean(snapshot?.traffic_source_status) || null,
        semantics: 'Traffic and freight evidence are logistics context, not proof of demand, crop economics, or site suitability.'
      }
    }));
  }

  const parcelRows = list(snapshot?.parcel_planning);
  const caParcel = snapshot?.california_parcel_planning ? [snapshot.california_parcel_planning] : [];
  if (parcelRows.length || caParcel.length) {
    rows.push(observation({
      snapshot,
      regionKeys: regions,
      observedAt: when,
      kind: 'site_parcel_planning_context',
      domains: ['infrastructure', 'construction', 'regulation'],
      summary: 'RIVET site intelligence contains parcel or planning evidence relevant to physical site diligence.',
      provenanceRefs: sourceRefs(snapshot),
      facts: {
        parcel_planning_record_count: parcelRows.length + caParcel.length,
        california_parcel_planning_status: clean(snapshot?.california_parcel_planning_status) || null,
        semantics: 'Parcel/planning context is screening evidence and does not replace zoning, permitting, title, engineering, or legal diligence.'
      }
    }));
  }

  const incentives = [
    ...list(snapshot?.incentives),
    ...list(snapshot?.new_york_ev_programs)
  ];
  if (incentives.length) {
    rows.push(observation({
      snapshot,
      regionKeys: regions,
      observedAt: when,
      kind: 'site_incentive_policy_context',
      domains: ['public_policy', 'regulation', 'economy'],
      summary: 'RIVET site intelligence contains incentive or program evidence that may inform infrastructure policy diligence.',
      provenanceRefs: sourceRefs(snapshot),
      facts: {
        incentive_record_count: incentives.length,
        incentive_source_status: clean(snapshot?.incentive_source_status) || null,
        semantics: 'Program presence is not eligibility, award, payment, or approval.'
      }
    }));
  }

  return {
    schema: 'evercraft.faie.rivet-bridge.v1',
    generated_at: new Date().toISOString(),
    region_keys: regions,
    source_snapshot_profile: clean(snapshot?.response_profile) || null,
    observation_count: rows.length,
    observations: rows,
    exclusions: [
      'charger inventory',
      'EV adoption',
      'charging-session utilization',
      'EV-specific sales angles',
      'EV-specific modeled demand'
    ],
    decision_authority: false,
    publication_authority: false
  };
}
