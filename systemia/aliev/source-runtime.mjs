import crypto from 'node:crypto';
import http from 'node:http';

const CENSUS = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const AFDC_NEAREST = 'https://developer.nlr.gov/api/alt-fuel-stations/v1/nearest.json';
const AFDC_INCENTIVES = 'https://developer.nlr.gov/api/transportation-incentives-laws/v1.json';
const OPENEI_UTILITY_RATES = 'https://api.openei.org/utility_rates';
const WSDOT_TRAFFIC = 'https://data.wsdot.wa.gov/arcgis/rest/services/Shared/TrafficData/FeatureServer/0/query';
const WA_UTILITY_AREAS = 'https://gis.ecology.wa.gov/serverext/rest/services/CPR/CPR/FeatureServer/0/query';
const CALTRANS_TRAFFIC = 'https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/Traffic_AADT/FeatureServer/0/query';
const CEC_UTILITY_AREAS = 'https://services3.arcgis.com/bWPjFyq029ChCGur/arcgis/rest/services/ElectricLoadServingEntities_IOU_POU/FeatureServer/0/query';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

const REQUIRED_DOMAINS = [
  'geocoding',
  'charging_inventory',
  'traffic',
  'traffic_temporal',
  'utility_service_area',
  'utility_tariff',
  'incentives',
  'parcel_planning',
  'local_ev_stock',
  'observed_sessions',
  'freight',
  'dwell_context',
  'deep_market_evidence',
  'provenance',
];

function clean(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sha(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function haversine(aLat, aLon, bLat, bLon) {
  const R = 3958.7613;
  const d2r = Math.PI / 180;
  const dLat = (bLat - aLat) * d2r;
  const dLon = (bLon - aLon) * d2r;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * d2r) * Math.cos(bLat * d2r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function stateFor({ ok, rows = 0, unavailable = 'NOT_OBSERVABLE' }) {
  if (!ok) return unavailable;
  return rows > 0 ? 'CONNECTED' : 'CONNECTED_EMPTY';
}

function safeError(error) {
  return clean(error instanceof Error ? error.message : String(error), 600);
}

async function fetchJson(fetchImpl, url, options = {}, timeoutMs = 10000) {
  const response = await fetchImpl(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`upstream_invalid_json:${new URL(url).hostname}`);
  }
  if (!response.ok) {
    throw new Error(`upstream_http_${response.status}:${new URL(url).hostname}`);
  }
  return data;
}

function firstMatchingAttribute(attributes = {}, patterns = []) {
  for (const [key, value] of Object.entries(attributes || {})) {
    if (patterns.some((pattern) => pattern.test(key))) return value;
  }
  return null;
}

async function queryArcGisPoint(fetchImpl, endpoint, lat, lon, {
  distanceMiles = 6,
  outFields = '*',
  timeoutMs = 10000,
} = {}) {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries({
    f: 'json',
    where: '1=1',
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    distance: String(distanceMiles),
    units: 'esriSRUnit_StatuteMile',
    outFields,
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: '100',
  })) {
    url.searchParams.set(key, value);
  }
  const data = await fetchJson(fetchImpl, url.toString(), {
    headers: { accept: 'application/json' },
  }, timeoutMs);
  if (data?.error) throw new Error(`arcgis_error:${clean(data.error.message || 'unknown', 300)}`);
  return Array.isArray(data?.features) ? data.features : [];
}

function normalizeCensusMatch(data, address) {
  const match = data?.result?.addressMatches?.[0];
  if (!match) return null;
  const components = match.addressComponents || {};
  const coordinates = match.coordinates || {};
  const geographies = match.geographies || {};
  const countyRows = Object.values(geographies)
    .flatMap((value) => Array.isArray(value) ? value : [])
    .filter((row) => row && typeof row === 'object' && /county/i.test(String(row.NAME || row.BASENAME || '')));
  const county = countyRows[0] || null;
  return {
    matched_address: clean(match.matchedAddress || address, 500),
    latitude: number(coordinates.y),
    longitude: number(coordinates.x),
    state: clean(components.state, 32).toUpperCase(),
    postal_code: clean(components.zip, 20),
    country_code: 'US',
    region: clean(components.state, 80),
    county: clean(county?.NAME || county?.BASENAME || '', 160),
    county_geoid: clean(county?.GEOID || county?.GEOIDFQ || '', 80),
    provider: 'US Census Geocoder',
    source_url: CENSUS,
    confidence_pct: 96,
  };
}

async function geocodeAddress(fetchImpl, address, userAgent) {
  const censusUrl = new URL(CENSUS);
  for (const [key, value] of Object.entries({
    address,
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    format: 'json',
  })) censusUrl.searchParams.set(key, value);

  try {
    const data = await fetchJson(fetchImpl, censusUrl.toString(), {
      headers: { 'user-agent': userAgent, accept: 'application/json' },
    });
    const match = normalizeCensusMatch(data, address);
    if (match?.latitude !== null && match?.longitude !== null) return match;
  } catch {}

  const nominatim = new URL(NOMINATIM);
  nominatim.searchParams.set('q', address);
  nominatim.searchParams.set('format', 'jsonv2');
  nominatim.searchParams.set('addressdetails', '1');
  nominatim.searchParams.set('limit', '1');
  const rows = await fetchJson(fetchImpl, nominatim.toString(), {
    headers: { 'user-agent': userAgent, accept: 'application/json' },
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error('address_not_found');
  const a = row.address || {};
  return {
    matched_address: clean(row.display_name || address, 500),
    latitude: number(row.lat),
    longitude: number(row.lon),
    state: clean(a.state_code || a['ISO3166-2-lvl4']?.split('-').at(-1) || a.state || '', 80).toUpperCase(),
    postal_code: clean(a.postcode, 20),
    country_code: clean(a.country_code || '', 8).toUpperCase(),
    region: clean(a.state || a.region || '', 160),
    county: clean(a.county || '', 160),
    county_geoid: '',
    provider: 'OpenStreetMap Nominatim',
    source_url: NOMINATIM,
    confidence_pct: 85,
  };
}

function chargerRow(row, lat, lon) {
  const clat = number(row?.latitude);
  const clon = number(row?.longitude);
  if (clat === null || clon === null) return null;
  const distance = number(row?.distance) ?? haversine(lat, lon, clat, clon);
  const units = Array.isArray(row?.ev_charging_units) ? row.ev_charging_units : [];
  const nestedPorts = units.reduce((sum, unit) => sum + (number(unit?.port_count) || 0), 0);
  const publishedPorts = [
    row?.ev_level1_evse_num,
    row?.ev_level2_evse_num,
    row?.ev_dc_fast_num,
    row?.ev_other_evse,
  ].reduce((sum, value) => sum + (number(value) || 0), 0);
  const maxPower = units
    .flatMap((unit) => Object.values(unit?.connectors || {}))
    .reduce((max, connector) => Math.max(max, number(connector?.power_kw) || 0), 0);
  return {
    source_id: `afdc:${row?.id ?? sha(JSON.stringify(row)).slice(0, 12)}`,
    name: clean(row?.station_name || row?.ev_network || 'Public EV charging station', 240),
    operator: clean(row?.ev_network || '', 160) || null,
    network: clean(row?.ev_network || '', 160) || null,
    latitude: clat,
    longitude: clon,
    distance_miles: Number(distance.toFixed(2)),
    ports: nestedPorts || publishedPorts || null,
    level1_ports: number(row?.ev_level1_evse_num),
    level2_ports: number(row?.ev_level2_evse_num),
    dc_fast_ports: number(row?.ev_dc_fast_num),
    power_kw: maxPower || null,
    connectors: Array.isArray(row?.ev_connector_types)
      ? row.ev_connector_types
      : clean(row?.ev_connector_types || '').split(/\s+/).filter(Boolean),
    address: [row?.street_address, row?.city, row?.state, row?.zip].filter(Boolean).join(', '),
    access: row?.access_code || null,
    opening_hours: row?.access_days_time || null,
    price_note: row?.ev_pricing || null,
    commissioned: row?.open_date || null,
    source_updated: row?.updated_at || row?.date_last_confirmed || null,
    status_code: row?.status_code || null,
    source: 'DOE / NLR Alternative Fuels Data Center',
    source_url: row?.id ? `https://afdc.energy.gov/stations/#/station/${row.id}` : 'https://afdc.energy.gov/stations/',
  };
}

async function chargingInventory(fetchImpl, geocode, apiKey, userAgent) {
  const url = new URL(AFDC_NEAREST);
  for (const [key, value] of Object.entries({
    api_key: apiKey || 'DEMO_KEY',
    latitude: String(geocode.latitude),
    longitude: String(geocode.longitude),
    radius: '25',
    fuel_type: 'ELEC',
    access: 'public',
    status: 'E',
    country: 'US',
    limit: '200',
  })) url.searchParams.set(key, value);
  const data = await fetchJson(fetchImpl, url.toString(), {
    headers: { 'user-agent': userAgent, accept: 'application/json' },
  }, 12000);
  const rows = Array.isArray(data?.fuel_stations)
    ? data.fuel_stations
    : Array.isArray(data?.stations)
      ? data.stations
      : [];
  return rows.map((row) => chargerRow(row, geocode.latitude, geocode.longitude))
    .filter(Boolean)
    .sort((a, b) => a.distance_miles - b.distance_miles)
    .slice(0, 80);
}

function trafficRow(feature, source, sourceUrl, lat, lon) {
  const attributes = feature?.attributes || {};
  const aadt = number(firstMatchingAttribute(attributes, [
    /^aadt$/i,
    /current.*aadt/i,
    /annual.*average.*daily/i,
    /traffic.*volume/i,
  ]));
  const year = number(firstMatchingAttribute(attributes, [/year/i, /yr$/i]));
  const route = clean(firstMatchingAttribute(attributes, [
    /route/i,
    /road/i,
    /street/i,
    /highway/i,
    /location/i,
  ]), 240);
  const geometry = feature?.geometry || {};
  const rowLat = number(geometry.y) ?? lat;
  const rowLon = number(geometry.x) ?? lon;
  return {
    aadt,
    reporting_year: year,
    route: route || null,
    latitude: rowLat,
    longitude: rowLon,
    distance_miles: rowLat !== null && rowLon !== null
      ? Number(haversine(lat, lon, rowLat, rowLon).toFixed(2))
      : null,
    source,
    source_url: sourceUrl,
    source_attributes: attributes,
  };
}

async function trafficEvidence(fetchImpl, geocode) {
  const state = geocode.state;
  const endpoint = state === 'WA'
    ? WSDOT_TRAFFIC
    : state === 'CA'
      ? CALTRANS_TRAFFIC
      : '';
  if (!endpoint) return { ok: false, status: 'adapter_required', rows: [], source: null, sourceUrl: null };
  const source = state === 'WA' ? 'Washington State Department of Transportation' : 'California Department of Transportation';
  const features = await queryArcGisPoint(fetchImpl, endpoint, geocode.latitude, geocode.longitude, {
    distanceMiles: 8,
  });
  const rows = features.map((feature) =>
    trafficRow(feature, source, endpoint, geocode.latitude, geocode.longitude)
  ).filter((row) => row.aadt !== null || row.route)
    .sort((a, b) => (b.aadt || 0) - (a.aadt || 0))
    .slice(0, 60);
  return { ok: true, status: rows.length ? 'ok' : 'empty', rows, source, sourceUrl: endpoint };
}

function utilityCandidate(feature, source, sourceUrl) {
  const attributes = feature?.attributes || {};
  const name = clean(firstMatchingAttribute(attributes, [
    /utility.*name/i,
    /company/i,
    /provider/i,
    /owner/i,
    /^name$/i,
    /serv.*area/i,
  ]), 240);
  return {
    utility_name: name || null,
    source,
    source_url: sourceUrl,
    source_attributes: attributes,
  };
}

async function utilityServiceArea(fetchImpl, geocode) {
  const endpoint = geocode.state === 'WA'
    ? WA_UTILITY_AREAS
    : geocode.state === 'CA'
      ? CEC_UTILITY_AREAS
      : '';
  if (!endpoint) return { ok: false, status: 'adapter_required', rows: [], sourceUrl: null };
  const source = geocode.state === 'WA'
    ? 'Washington Ecology electric utility service-area screening polygons'
    : 'California Energy Commission electric load-serving entity screening polygons';
  const features = await queryArcGisPoint(fetchImpl, endpoint, geocode.latitude, geocode.longitude, {
    distanceMiles: 0.1,
  });
  return {
    ok: true,
    status: features.length ? 'ok' : 'empty',
    rows: features.map((feature) => utilityCandidate(feature, source, endpoint)).slice(0, 20),
    sourceUrl: endpoint,
  };
}

async function utilityRates(fetchImpl, geocode, openEiApiKey, utilityRows, userAgent) {
  if (!openEiApiKey) return { ok: false, status: 'api_key_required', rows: [] };
  const url = new URL(OPENEI_UTILITY_RATES);
  const effectiveOn = new Date().toISOString().slice(0, 10);
  for (const [key, value] of Object.entries({
    version: 'latest',
    format: 'json',
    api_key: openEiApiKey,
    lat: String(geocode.latitude),
    lon: String(geocode.longitude),
    radius: '0',
    co_limit: '8',
    sector: 'Commercial',
    approved: 'true',
    effective_on_date: effectiveOn,
    limit: '100',
    detail: 'full',
    orderby: 'startdate',
    direction: 'desc',
  })) url.searchParams.set(key, value);
  const data = await fetchJson(fetchImpl, url.toString(), {
    headers: { 'user-agent': userAgent, accept: 'application/json' },
  }, 12000);
  const rows = [
    ...(Array.isArray(data?.items) ? data.items : []),
    ...(Array.isArray(data?.results) ? data.results : []),
  ].slice(0, 100);
  const utilityNames = utilityRows.map((row) => row.utility_name).filter(Boolean);
  return {
    ok: true,
    status: rows.length ? 'ok' : 'empty',
    rows: rows.map((row) => ({
      ...row,
      evidence_state: 'PUBLIC_RATE_CANDIDATE',
      assignment_confirmed: false,
      candidate_utility_context: utilityNames,
      semantics: 'OpenEI rate records are screening candidates, not an assigned tariff for the address.',
    })),
  };
}

async function incentiveEvidence(fetchImpl, state, apiKey, userAgent) {
  if (!state || state.length > 3) return { ok: false, status: 'jurisdiction_unresolved', rows: [] };
  const url = new URL(AFDC_INCENTIVES);
  url.searchParams.set('api_key', apiKey || 'DEMO_KEY');
  url.searchParams.set('jurisdiction', `US-${state}`);
  url.searchParams.set('technology', 'ELEC');
  const data = await fetchJson(fetchImpl, url.toString(), {
    headers: { 'user-agent': userAgent, accept: 'application/json' },
  }, 12000);
  const rows = Array.isArray(data?.result)
    ? data.result
    : Array.isArray(data?.laws)
      ? data.laws
      : Array.isArray(data)
        ? data
        : [];
  return {
    ok: true,
    status: rows.length ? 'ok' : 'empty',
    rows: rows.slice(0, 80).map((row) => ({
      id: row?.id || null,
      title: row?.title || row?.name || 'EV law or incentive',
      type: row?.type || row?.incentive_type || row?.regulation_type || null,
      jurisdiction: row?.jurisdiction || `US-${state}`,
      enacted_date: row?.enacted_date || null,
      amended_date: row?.amended_date || null,
      expired_date: row?.expired_date || null,
      text: row?.text || row?.description || null,
      source_url: row?.url || row?.source_url || null,
    })),
  };
}

async function dwellEvidence(fetchImpl, geocode, userAgent) {
  const query = `[out:json][timeout:15];(node(around:2500,${geocode.latitude},${geocode.longitude})["amenity"~"restaurant|cafe|hospital|university|cinema|parking"];node(around:2500,${geocode.latitude},${geocode.longitude})["tourism"~"hotel|motel"];node(around:2500,${geocode.latitude},${geocode.longitude})["shop"~"supermarket|mall"];);out center 60;`;
  const response = await fetchImpl(OVERPASS, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': userAgent,
      accept: 'application/json',
    },
    body: new URLSearchParams({ data: query }).toString(),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`overpass_http_${response.status}`);
  const data = await response.json();
  const rows = Array.isArray(data?.elements) ? data.elements : [];
  return rows.map((element) => {
    const tags = element?.tags || {};
    const center = element?.center || {};
    const lat = number(element?.lat ?? center?.lat);
    const lon = number(element?.lon ?? center?.lon);
    return {
      name: tags.name || tags.brand || tags.operator || 'Mapped dwell anchor',
      category: tags.amenity || tags.tourism || tags.shop || null,
      latitude: lat,
      longitude: lon,
      distance_miles: lat !== null && lon !== null
        ? Number(haversine(geocode.latitude, geocode.longitude, lat, lon).toFixed(2))
        : null,
      source: 'OpenStreetMap / Overpass',
      source_url: element?.type && element?.id
        ? `https://www.openstreetmap.org/${element.type}/${element.id}`
        : 'https://www.openstreetmap.org/',
    };
  }).sort((a, b) => (a.distance_miles ?? 999) - (b.distance_miles ?? 999)).slice(0, 40);
}

function coverageEntry(state, recordCount, sourceStatus) {
  return {
    state: clean(state, 120) || 'NOT_OBSERVABLE',
    record_count: Math.max(0, Number(recordCount || 0)),
    source_status: clean(sourceStatus || '', 240) || null,
  };
}

function evidenceContract(state, value, proxy, semantics, confidencePct = 0) {
  return {
    state,
    value: value ?? null,
    proxy: proxy ?? null,
    semantics: semantics || null,
    confidence_pct: confidencePct,
  };
}

function sourceRecord(url, status, retrievedAt) {
  return {
    id: `source:${sha(url).slice(0, 24)}`,
    url,
    status,
    retrieved_at: retrievedAt,
  };
}

export async function buildOwnedSiteSnapshot({
  address,
  fetchImpl = fetch,
  afdcApiKey = process.env.NLR_API_KEY || process.env.AFDC_API_KEY || 'DEMO_KEY',
  openEiApiKey = process.env.OPENEI_API_KEY || process.env.OPEN_EI_API_KEY || '',
  userAgent = process.env.ALIEV_SOURCE_USER_AGENT || 'Evercraft-AliEV/1.0 (source-backed EV site screening)',
  now = () => new Date().toISOString(),
} = {}) {
  const requested = clean(address, 600);
  if (requested.length < 5) throw new Error('address_required');

  const retrievedAt = now();
  const sourceRecords = [];
  const sourceStatus = {};

  const geocode = await geocodeAddress(fetchImpl, requested, userAgent);
  if (geocode.latitude === null || geocode.longitude === null) throw new Error('geocode_coordinates_missing');
  sourceRecords.push(sourceRecord(geocode.source_url, 'connected', retrievedAt));

  let chargers = [];
  try {
    chargers = await chargingInventory(fetchImpl, geocode, afdcApiKey, userAgent);
    sourceStatus.charging = chargers.length ? 'ok' : 'empty';
    sourceRecords.push(sourceRecord(AFDC_NEAREST, sourceStatus.charging, retrievedAt));
  } catch (error) {
    sourceStatus.charging = `unavailable:${safeError(error)}`;
  }

  let traffic = [];
  let trafficSourceName = null;
  let trafficSourceUrl = null;
  try {
    const result = await trafficEvidence(fetchImpl, geocode);
    traffic = result.rows;
    trafficSourceName = result.source;
    trafficSourceUrl = result.sourceUrl;
    sourceStatus.traffic = result.status;
    if (result.sourceUrl) sourceRecords.push(sourceRecord(result.sourceUrl, result.status, retrievedAt));
  } catch (error) {
    sourceStatus.traffic = `unavailable:${safeError(error)}`;
  }

  let utilityRows = [];
  try {
    const result = await utilityServiceArea(fetchImpl, geocode);
    utilityRows = result.rows;
    sourceStatus.utility_service_area = result.status;
    if (result.sourceUrl) sourceRecords.push(sourceRecord(result.sourceUrl, result.status, retrievedAt));
  } catch (error) {
    sourceStatus.utility_service_area = `unavailable:${safeError(error)}`;
  }

  let rateRows = [];
  try {
    const result = await utilityRates(fetchImpl, geocode, openEiApiKey, utilityRows, userAgent);
    rateRows = result.rows;
    sourceStatus.utility_tariff = result.status;
    if (result.ok) sourceRecords.push(sourceRecord(OPENEI_UTILITY_RATES, result.status, retrievedAt));
  } catch (error) {
    sourceStatus.utility_tariff = `unavailable:${safeError(error)}`;
  }

  let incentives = [];
  try {
    const result = await incentiveEvidence(fetchImpl, geocode.state, afdcApiKey, userAgent);
    incentives = result.rows;
    sourceStatus.incentives = result.status;
    if (result.ok) sourceRecords.push(sourceRecord(AFDC_INCENTIVES, result.status, retrievedAt));
  } catch (error) {
    sourceStatus.incentives = `unavailable:${safeError(error)}`;
  }

  let dwellAnchors = [];
  try {
    dwellAnchors = await dwellEvidence(fetchImpl, geocode, userAgent);
    sourceStatus.dwell = dwellAnchors.length ? 'ok' : 'empty';
    sourceRecords.push(sourceRecord(OVERPASS, sourceStatus.dwell, retrievedAt));
  } catch (error) {
    sourceStatus.dwell = `unavailable:${safeError(error)}`;
  }

  const chargingState = stateFor({ ok: !String(sourceStatus.charging).startsWith('unavailable'), rows: chargers.length });
  const trafficState = sourceStatus.traffic === 'adapter_required'
    ? 'NOT_OBSERVABLE'
    : stateFor({ ok: !String(sourceStatus.traffic).startsWith('unavailable'), rows: traffic.length });
  const utilityAreaState = sourceStatus.utility_service_area === 'adapter_required'
    ? 'NOT_OBSERVABLE'
    : stateFor({ ok: !String(sourceStatus.utility_service_area).startsWith('unavailable'), rows: utilityRows.length });
  const utilityTariffState = sourceStatus.utility_tariff === 'api_key_required'
    ? 'NOT_OBSERVABLE'
    : stateFor({ ok: !String(sourceStatus.utility_tariff).startsWith('unavailable'), rows: rateRows.length });
  const incentiveState = stateFor({ ok: !String(sourceStatus.incentives).startsWith('unavailable'), rows: incentives.length });
  const dwellState = stateFor({ ok: !String(sourceStatus.dwell).startsWith('unavailable'), rows: dwellAnchors.length });

  const coverageContract = {
    country_code: geocode.country_code,
    baseline_state: 'READY_OWNED_SOURCE',
    geocoding: evidenceContract(
      'OBSERVED_VERIFIED',
      {
        matched_address: geocode.matched_address,
        latitude: geocode.latitude,
        longitude: geocode.longitude,
        provider: geocode.provider,
      },
      null,
      'Address and coordinates were returned by the named public geocoder.',
      geocode.confidence_pct,
    ),
    charging_inventory: evidenceContract(
      chargingState,
      chargers,
      chargingState === 'NOT_OBSERVABLE'
        ? { type: 'CHARGING_SOURCE_UNAVAILABLE', message: 'Charging inventory could not be observed. Missing is not zero.' }
        : null,
      'Mapped public charging inventory is site context, not observed utilization.',
      chargers.length ? 92 : 0,
    ),
    traffic: evidenceContract(
      trafficState,
      traffic,
      trafficState === 'NOT_OBSERVABLE'
        ? { type: 'TRAFFIC_ADAPTER_UNAVAILABLE', message: 'No verified traffic observation is available for this screening run.' }
        : null,
      'AADT and roadway attributes are screening evidence, not live congestion or charging demand.',
      traffic.length ? 90 : 0,
    ),
    traffic_temporal: evidenceContract(
      'NOT_OBSERVABLE',
      null,
      { type: 'TEMPORAL_TRAFFIC_SOURCE_REQUIRED', message: 'Temporal traffic profiles are not connected in the owned v1 source runtime.' },
      'Missing temporal traffic evidence is not zero.',
      0,
    ),
    utility_service_area: evidenceContract(
      utilityAreaState,
      utilityRows,
      utilityAreaState === 'NOT_OBSERVABLE'
        ? { type: 'UTILITY_SERVICE_AREA_UNRESOLVED', message: 'Serving utility must be confirmed before tariff assignment.' }
        : null,
      'Utility-area GIS is screening evidence only. Confirm actual service with the utility.',
      utilityRows.length ? 88 : 0,
    ),
    utility_tariff: evidenceContract(
      utilityTariffState,
      rateRows,
      utilityTariffState === 'NOT_OBSERVABLE'
        ? { type: 'UTILITY_TARIFF_UNRESOLVED', message: 'Applicable commercial tariff remains unassigned.' }
        : { type: 'UTILITY_CONFIRMATION_REQUIRED', message: 'Rate records are candidates only until serving utility and service configuration are confirmed.' },
      'OpenEI rate records are candidate context, never automatic tariff assignment.',
      rateRows.length ? 80 : 0,
    ),
    incentives: evidenceContract(
      incentiveState,
      incentives,
      incentiveState === 'NOT_OBSERVABLE'
        ? { type: 'INCENTIVE_SOURCE_UNAVAILABLE', message: 'No verified incentive records were returned.' }
        : null,
      'Program existence does not establish site, applicant, equipment, funding, stacking or award eligibility.',
      incentives.length ? 88 : 0,
    ),
    parcel_planning: evidenceContract(
      'NOT_OBSERVABLE',
      null,
      { type: 'PARCEL_PLANNING_ADAPTER_REQUIRED', message: 'Parcel and zoning adapters remain a later owned-source expansion.' },
      'No parcel or zoning conclusion is inferred from missing data.',
      0,
    ),
    local_ev_stock: evidenceContract(
      'NOT_OBSERVABLE',
      null,
      { type: 'LOCAL_EV_STOCK_SOURCE_REQUIRED', message: 'No verified active local EV stock snapshot is connected in owned v1.' },
      'Missing active stock is not zero and registration flow is not active stock.',
      0,
    ),
    sessions_utilization: evidenceContract(
      'NOT_OBSERVABLE',
      null,
      { type: 'OBSERVED_SESSION_DATA_REQUIRED', message: 'No permissioned observed session data is connected for this site context.' },
      'Modeled demand must remain distinct from observed charging sessions.',
      0,
    ),
    freight: evidenceContract(
      'NOT_OBSERVABLE',
      null,
      { type: 'FREIGHT_ADAPTER_REQUIRED', message: 'Freight context is not connected in owned v1.' },
      'Missing freight evidence is not zero.',
      0,
    ),
    dwell_context: evidenceContract(
      dwellState,
      dwellAnchors,
      dwellState === 'NOT_OBSERVABLE'
        ? { type: 'DWELL_CONTEXT_SOURCE_UNAVAILABLE', message: 'Mapped dwell anchors were not observable.' }
        : null,
      'Mapped dwell anchors are contextual points of interest, not measured visits or dwell time.',
      dwellAnchors.length ? 75 : 0,
    ),
    deep_market_evidence: evidenceContract(
      sourceRecords.length ? 'CONNECTED' : 'NOT_OBSERVABLE',
      sourceRecords,
      null,
      'This layer records source coverage and provenance only; it does not invent market telemetry.',
      sourceRecords.length ? 90 : 0,
    ),
    provenance_rule: 'Every report-relevant source domain is explicit. Missing observed data is never converted to zero.',
  };

  const manifestDomains = {
    geocoding: coverageEntry('CONNECTED', 1, geocode.provider),
    charging_inventory: coverageEntry(chargingState, chargers.length, sourceStatus.charging),
    traffic: coverageEntry(trafficState, traffic.length, sourceStatus.traffic),
    traffic_temporal: coverageEntry('NOT_OBSERVABLE', 0, 'not_connected_owned_v1'),
    utility_service_area: coverageEntry(utilityAreaState, utilityRows.length, sourceStatus.utility_service_area),
    utility_tariff: coverageEntry(utilityTariffState, rateRows.length, sourceStatus.utility_tariff),
    incentives: coverageEntry(incentiveState, incentives.length, sourceStatus.incentives),
    parcel_planning: coverageEntry('NOT_OBSERVABLE', 0, 'not_connected_owned_v1'),
    local_ev_stock: coverageEntry('NOT_OBSERVABLE', 0, 'not_connected_owned_v1'),
    observed_sessions: coverageEntry('NOT_OBSERVABLE', 0, 'permissioned_source_not_connected'),
    freight: coverageEntry('NOT_OBSERVABLE', 0, 'not_connected_owned_v1'),
    dwell_context: coverageEntry(dwellState, dwellAnchors.length, sourceStatus.dwell),
    deep_market_evidence: coverageEntry(sourceRecords.length ? 'CONNECTED' : 'NOT_OBSERVABLE', sourceRecords.length, 'source_coverage_records'),
    provenance: coverageEntry(sourceRecords.length ? 'CONNECTED' : 'NOT_OBSERVABLE', sourceRecords.length, 'owned_source_refs'),
  };

  for (const domain of REQUIRED_DOMAINS) {
    if (!manifestDomains[domain]?.state) throw new Error(`coverage_domain_missing:${domain}`);
  }

  return {
    response_profile: 'rivet_report_snapshot_v1',
    evidence_state: 'SOURCE_BACKED_OWNED_RUNTIME',
    access_policy: {
      commercial_access: true,
      authority: 'systemia_machine',
      source_runtime: 'systemia.aliev-source-runtime.v1',
    },
    address_input: requested,
    matched_address: geocode.matched_address,
    latitude: geocode.latitude,
    longitude: geocode.longitude,
    state: geocode.state,
    postal_code: geocode.postal_code,
    country_code: geocode.country_code,
    region: geocode.region,
    county: geocode.county,
    county_geoid: geocode.county_geoid,
    geocoder_source: geocode.provider,
    coverage_contract: coverageContract,
    source_record_ids: sourceRecords.map((record) => record.id),
    source_records: sourceRecords,
    chargers,
    charger_source_status: sourceStatus.charging,
    charger_source_name: 'DOE / NLR Alternative Fuels Data Center',
    charger_source_url: AFDC_NEAREST,
    charger_source_license: 'Public U.S. Department of Energy / National Laboratory of the Rockies station data; source attribution retained.',
    traffic,
    traffic_source_status: sourceStatus.traffic,
    traffic_source_name: trafficSourceName,
    traffic_source_url: trafficSourceUrl,
    traffic_query_radius_miles: 8,
    traffic_profiles: [],
    traffic_semantics: coverageContract.traffic.semantics,
    washington_utility_service_area_candidates: geocode.state === 'WA' ? utilityRows : [],
    washington_utility_service_area_status: geocode.state === 'WA' ? sourceStatus.utility_service_area : 'not_applicable',
    california_utility_service_area_candidates: geocode.state === 'CA' ? utilityRows : [],
    california_utility_service_area_status: geocode.state === 'CA' ? sourceStatus.utility_service_area : 'not_applicable',
    california_other_lse_overlap_context: [],
    california_candidate_tariff_catalog: [],
    california_candidate_tariff_status: 'not_connected_owned_v1',
    california_utility_confirmation_paths: [],
    utility_rate_candidates: rateRows,
    utility_rate_candidate_utilities: utilityRows.map((row) => row.utility_name).filter(Boolean),
    utility_rate_source_status: sourceStatus.utility_tariff,
    utility_rate_semantics: coverageContract.utility_tariff.semantics,
    incentives,
    incentive_source_status: sourceStatus.incentives,
    incentive_evidence: coverageContract.incentives,
    new_york_ev_programs: [],
    new_york_program_source_status: geocode.state === 'NY' ? 'not_connected_owned_v1' : 'not_applicable',
    california_parcel_planning: null,
    california_parcel_planning_status: geocode.state === 'CA' ? 'not_connected_owned_v1' : 'not_applicable',
    local_ev_stock: null,
    local_ev_stock_status: 'not_connected_owned_v1',
    nearby_observed_usage: [],
    freight_context: null,
    dwell_anchors: dwellAnchors,
    dwell_source_status: sourceStatus.dwell,
    deep_benchmark_records: [],
    deep_market_evidence: sourceRecords,
    deep_utility_program_evidence: [],
    deep_external_evidence: [],
    deep_evidence_semantics: coverageContract.deep_market_evidence.semantics,
    source_coverage_manifest: {
      schema: 'evercraft.rivet.source-coverage.v1',
      generated_at: retrievedAt,
      domains: manifestDomains,
      semantics: 'Every RIVET report-relevant AliEV domain is explicit. NOT_OBSERVABLE is a valid evidence state and never means zero.',
    },
    retrieved_at: retrievedAt,
  };
}

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(data.length),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(data);
}

async function readJson(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

export async function startAliEvSourceRuntime({
  host = '127.0.0.1',
  port = 0,
  systemiaMachineKey = process.env.SYSTEMIA_MACHINE_KEY || '',
  afdcApiKey = process.env.NLR_API_KEY || process.env.AFDC_API_KEY || 'DEMO_KEY',
  openEiApiKey = process.env.OPENEI_API_KEY || process.env.OPEN_EI_API_KEY || '',
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
} = {}) {
  const instanceId = `aliev-owned-${crypto.randomBytes(8).toString('hex')}`;
  let deploymentReceiptRef = '';

  const health = () => ({
    ok: true,
    service: 'aliev-owned-source-runtime',
    schema: 'evercraft.aliev.source-runtime-health.v1',
    instance_id: instanceId,
    runtime_owner: 'evercraft',
    source_contract: 'rivet_report_snapshot_v1',
    legacy_provider_transport: false,
    machine_auth_configured: Boolean(clean(systemiaMachineKey)),
    deployment_receipt_bound: Boolean(deploymentReceiptRef),
    deployment_receipt_ref: deploymentReceiptRef || null,
    adapters: {
      census_geocoder: true,
      nominatim_fallback: true,
      afdc_charging: true,
      state_traffic: true,
      utility_service_area: true,
      openei_tariff_candidates: Boolean(clean(openEiApiKey)),
      afdc_incentives: true,
      osm_dwell_context: true,
    },
    evidence_rule: 'missing_is_never_zero',
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        return sendJson(res, 200, health());
      }
      if (req.method !== 'POST' || !['/v1/site-snapshot', '/functions/energySiteLookup'].includes(req.url || '')) {
        return sendJson(res, 404, { ok: false, error: 'not_found' });
      }
      if (!clean(systemiaMachineKey)) {
        return sendJson(res, 503, { ok: false, error: 'systemia_machine_key_not_configured' });
      }
      if (clean(req.headers['x-systemia-machine-key']) !== clean(systemiaMachineKey)) {
        return sendJson(res, 401, { ok: false, error: 'systemia_machine_authorization_required' });
      }
      const body = await readJson(req);
      if (body?.mode && body.mode !== 'rivet_report_snapshot') {
        return sendJson(res, 422, { ok: false, error: 'unsupported_mode' });
      }
      const snapshot = await buildOwnedSiteSnapshot({
        address: body?.address,
        fetchImpl,
        afdcApiKey,
        openEiApiKey,
        now,
      });
      return sendJson(res, 200, snapshot);
    } catch (error) {
      return sendJson(res, 502, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;

  return {
    schema: 'evercraft.aliev.source-runtime.v1',
    instance_id: instanceId,
    service_url: `http://${host}:${actualPort}`,
    snapshot_path: '/v1/site-snapshot',
    health_path: '/health',
    health,
    setDeploymentReceipt: (receiptRef) => {
      deploymentReceiptRef = clean(receiptRef, 400);
      return health();
    },
    close: () => new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    ),
  };
}
