export const US_SESSION_JURISDICTIONS = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','GU','VI','AS','MP'
];

export const SESSION_SOURCE_LANES = [
  {
    id:'state-open-data',
    authority:'public',
    objective:'Find state, county, municipal, utility, transit, university, and public-agency datasets or reports that publish observed EV charging sessions by identifiable site and period.'
  },
  {
    id:'federal-funded-publication',
    authority:'public',
    objective:'Find public NEVI/CFI/EVC-RAA recipient reports, dashboards, project reports, grant closeouts, and state publications derived from required charging-session reporting. Do not treat restricted EV-ChART raw data as public.'
  },
  {
    id:'grant-project-reports',
    authority:'public',
    objective:'Find grant-funded project reports with site-resolved observed charging sessions, energy, connected time, or utilization. Preserve any confidentiality or aggregation boundaries.'
  },
  {
    id:'operator-utility-public',
    authority:'public',
    objective:'Find charging-network, utility, site-host, fleet, airport, parking, campus, and corridor reports that publish site-resolved observed sessions or utilization.'
  },
  {
    id:'public-records-candidate',
    authority:'request_required',
    objective:'Identify agencies holding releasable session/utilization records and prepare a request candidate. Never send a records request without explicit authority.'
  }
];

export const NATIONAL_PARTNER_LANES = [
  {
    id:'licensed-utilization-provider',
    authority:'commercial_contract_required',
    objective:'Evaluate legitimate nationwide observed-utilization providers for API/export coverage, station resolution, history, session counts, energy, licensing, redistribution, and refresh cadence. Do not purchase or accept obligations without explicit authority.'
  },
  {
    id:'cpo-direct-feed',
    authority:'data_agreement_required',
    objective:'Pursue direct operator/network/site-host feeds using OCPI/OCPP exports, transaction/CDR feeds, or bounded aggregate exports with explicit data rights.'
  },
  {
    id:'customer-partner-upload',
    authority:'user_authorized',
    objective:'Normalize customer, fleet, site-host, utility, and operator exports into the canonical observed-usage schema while preserving source ownership and access constraints.'
  }
];

export const SESSION_ACCEPTANCE = {
  canonical_entity:'EVObservedUsageAggregate',
  required_for_session_coverage:[
    'station_external_id_or_stable_site_key',
    'latitude_longitude_or_geocodable_address',
    'period_start',
    'period_granularity',
    'charging_sessions_count',
    'source_ref',
    'source_url_or_internal_receipt',
    'data_status',
    'provenance_notes'
  ],
  may_enrich:[
    'period_end','energy_kwh','connected_hours','connector_count','source_vintage','confidence_pct'
  ],
  forbidden_promotions:[
    'charger inventory -> observed sessions',
    'AADT -> observed sessions',
    'modeled utilization -> observed sessions',
    'energy-only aggregate -> session count',
    'network availability -> sessions',
    'statewide aggregate -> site-resolved sessions'
  ]
};

export function buildNationalSessionWorkQueue(){
  const jurisdictionWork=US_SESSION_JURISDICTIONS.flatMap(jurisdiction =>
    SESSION_SOURCE_LANES.map(lane=>({
      schema:'evercraft.rivet.session-acquisition-work.v1',
      mission_id:'rivet-us-session-sprawl-001',
      jurisdiction,
      lane_id:lane.id,
      authority:lane.authority,
      objective:lane.objective,
      output_states:['INGESTED','ADAPTER_READY','LEGITIMATELY_BLOCKED','NO_PUBLIC_SOURCE_FOUND'],
      canonical_entity:SESSION_ACCEPTANCE.canonical_entity
    }))
  );
  const partnerWork=NATIONAL_PARTNER_LANES.map(lane=>({
    schema:'evercraft.rivet.session-acquisition-work.v1',
    mission_id:'rivet-us-session-sprawl-001',
    jurisdiction:'US',
    lane_id:lane.id,
    authority:lane.authority,
    objective:lane.objective,
    output_states:['PARTNER_CANDIDATE','INTEGRATION_READY','LEGITIMATELY_BLOCKED'],
    canonical_entity:SESSION_ACCEPTANCE.canonical_entity
  }));
  return [...jurisdictionWork,...partnerWork];
}

export function coverageReceipt(rows=[]){
  const canonical=(Array.isArray(rows)?rows:[]).filter(row =>
    row && row.charging_sessions_count != null &&
    (row.latitude != null && row.longitude != null || String(row.address||'').trim()) &&
    row.period_start && row.period_granularity && row.source_ref
  );
  const jurisdictions=[...new Set(canonical.map(row=>String(row.jurisdiction||'').trim()).filter(Boolean))].sort();
  const sites=[...new Set(canonical.map(row=>String(row.station_external_id||row.site_id||row.aggregate_key||'').trim()).filter(Boolean))];
  return {
    schema:'evercraft.rivet.session-coverage-receipt.v1',
    mission_id:'rivet-us-session-sprawl-001',
    accepted_session_rows:canonical.length,
    accepted_sites:sites.length,
    jurisdictions_with_accepted_rows:jurisdictions,
    jurisdiction_count:jurisdictions.length
  };
}
