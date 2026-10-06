const SDA_ENDPOINT = 'https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest';
const SDA_HELP = 'https://sdmdataaccess.nrcs.usda.gov/WebServiceHelp.aspx';
const SDA_ADVANCED = 'https://sdmdataaccess.nrcs.usda.gov/documents/AdvancedQueries.html';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function finiteCoordinate(value, min, max, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new TypeError(name + ' must be a finite coordinate in range');
  }
  return number;
}

function sqlNumber(value) {
  return Number(value).toFixed(6);
}

export function pointAoiWkt(latitude, longitude, halfSpanDegrees = 0.00005) {
  const lat = finiteCoordinate(latitude, -90, 90, 'latitude');
  const lon = finiteCoordinate(longitude, -180, 180, 'longitude');
  const span = Math.max(0.00001, Math.min(0.0025, Number(halfSpanDegrees) || 0.00005));
  const west = lon - span;
  const east = lon + span;
  const south = lat - span;
  const north = lat + span;

  return [
    'polygon((',
    sqlNumber(west) + ' ' + sqlNumber(south) + ',',
    sqlNumber(west) + ' ' + sqlNumber(north) + ',',
    sqlNumber(east) + ' ' + sqlNumber(north) + ',',
    sqlNumber(east) + ' ' + sqlNumber(south) + ',',
    sqlNumber(west) + ' ' + sqlNumber(south),
    '))'
  ].join('');
}

export function buildUsdaSoilQuery({ latitude, longitude } = {}) {
  const wkt = pointAoiWkt(latitude, longitude);
  const escapedWkt = wkt.replaceAll("'", "''");

  return `
SELECT TOP 100
  sac.saversion,
  sac.saverest,
  l.areasymbol,
  l.areaname,
  mu.mukey,
  mu.musym,
  mu.muname,
  mu.farmlndcl,
  c.cokey,
  c.compname,
  c.comppct_r,
  c.majcompflag,
  c.slope_r,
  ch.chkey,
  ch.hzname,
  ch.hzdept_r,
  ch.hzdepb_r,
  ch.sandtotal_r,
  ch.silttotal_r,
  ch.claytotal_r,
  ch.dbthirdbar_r,
  ch.wthirdbar_r,
  ch.wfifteenbar_r
FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${escapedWkt}') s
INNER JOIN mapunit mu ON mu.mukey = s.mukey
INNER JOIN legend l ON l.lkey = mu.lkey
INNER JOIN sacatalog sac ON sac.areasymbol = l.areasymbol
LEFT OUTER JOIN component c ON c.mukey = mu.mukey
LEFT OUTER JOIN chorizon ch ON ch.cokey = c.cokey
WHERE l.areatypename = 'Non-MLRA Soil Survey Area'
  AND (c.comppct_r IS NULL OR c.comppct_r >= 10)
ORDER BY mu.mukey, c.comppct_r DESC, c.compname, ch.hzdept_r
`.trim();
}

function tableObjects(payload) {
  const table = Array.isArray(payload?.Table) ? payload.Table : [];
  if (table.length < 2 || !Array.isArray(table[0])) return [];
  const headers = table[0].map((value) => clean(value));
  return table.slice(1)
    .filter(Array.isArray)
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])));
}

function newestSourceDate(rows, fallback) {
  const timestamps = rows
    .map((row) => Date.parse(clean(row.saverest)))
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  return timestamps.length ? new Date(timestamps[0]).toISOString() : fallback;
}

function numberOrNull(value) {
  if (value === null || value === undefined || clean(value) === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function summarizeRows(rows) {
  const mapunits = new Map();
  for (const row of rows) {
    const mukey = clean(row.mukey);
    if (!mukey) continue;
    if (!mapunits.has(mukey)) {
      mapunits.set(mukey, {
        mukey,
        musym: clean(row.musym) || null,
        muname: clean(row.muname) || null,
        farmland_classification: clean(row.farmlndcl) || null,
        survey_area_symbol: clean(row.areasymbol) || null,
        survey_area_name: clean(row.areaname) || null,
        source_version: clean(row.saversion) || null,
        source_updated_at: clean(row.saverest) || null,
        components: new Map()
      });
    }

    const mapunit = mapunits.get(mukey);
    const cokey = clean(row.cokey);
    if (!cokey) continue;
    if (!mapunit.components.has(cokey)) {
      mapunit.components.set(cokey, {
        cokey,
        name: clean(row.compname) || null,
        percent: numberOrNull(row.comppct_r),
        major_component: clean(row.majcompflag).toLowerCase() === 'yes',
        slope_percent: numberOrNull(row.slope_r),
        horizons: []
      });
    }

    const component = mapunit.components.get(cokey);
    const chkey = clean(row.chkey);
    if (chkey && !component.horizons.some((horizon) => horizon.chkey === chkey)) {
      component.horizons.push({
        chkey,
        name: clean(row.hzname) || null,
        top_cm: numberOrNull(row.hzdept_r),
        bottom_cm: numberOrNull(row.hzdepb_r),
        sand_percent: numberOrNull(row.sandtotal_r),
        silt_percent: numberOrNull(row.silttotal_r),
        clay_percent: numberOrNull(row.claytotal_r),
        bulk_density_g_cm3: numberOrNull(row.dbthirdbar_r),
        water_content_33kpa_percent: numberOrNull(row.wthirdbar_r),
        water_content_1500kpa_percent: numberOrNull(row.wfifteenbar_r)
      });
    }
  }

  return [...mapunits.values()].map((mapunit) => ({
    ...mapunit,
    components: [...mapunit.components.values()]
  }));
}

export async function collectUsdaSoilAtPoint({
  latitude,
  longitude,
  regionKeys = [],
  fetchImpl = globalThis.fetch,
  retrievedAt = new Date().toISOString()
} = {}) {
  const lat = finiteCoordinate(latitude, -90, 90, 'latitude');
  const lon = finiteCoordinate(longitude, -180, 180, 'longitude');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl is required');

  const query = buildUsdaSoilQuery({ latitude: lat, longitude: lon });
  const body = new URLSearchParams({
    service: 'query',
    request: 'query',
    query,
    format: 'JSON+COLUMNNAME'
  });

  const response = await fetchImpl(SDA_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'accept': 'application/json',
      'user-agent': 'Evercraft-FAIE/1.0'
    },
    body: body.toString(),
    signal: AbortSignal.timeout(15000)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error('usda_soil_data_access_http_' + response.status);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('usda_soil_data_access_invalid_json');
  }

  const rows = tableObjects(payload);
  const mapunits = summarizeRows(rows);
  const sourceUpdatedAt = newestSourceDate(rows, retrievedAt);
  const regions = [...new Set((Array.isArray(regionKeys) ? regionKeys : [regionKeys]).map(clean).filter(Boolean))];

  const observation = mapunits.length ? {
    observation_id: 'usda-soil:' + [lat.toFixed(6), lon.toFixed(6), sourceUpdatedAt].join(':'),
    source_system: 'usda_nrcs_soil_data_access',
    source_family: 'USDA NRCS Soil Data Access',
    observed_at: sourceUpdatedAt,
    region_keys: regions.length ? regions : ['site:' + lat.toFixed(5) + ',' + lon.toFixed(5)],
    domains: ['agriculture', 'environment'],
    kind: 'soil_site_profile',
    evidence_state: 'reported',
    reliability: 0.92,
    anomaly_score: 0,
    summary: 'USDA NRCS Soil Data Access returned ' + mapunits.length + ' SSURGO map unit' + (mapunits.length === 1 ? '' : 's') + ' for the supplied site point.',
    provenance_refs: [SDA_ENDPOINT, SDA_HELP, SDA_ADVANCED],
    facts: {
      latitude: lat,
      longitude: lon,
      spatial_scope: 'small_polygon_around_supplied_point',
      mapunit_count: mapunits.length,
      mapunits,
      source_semantics: 'Official mapped soil-survey evidence. This is not a field soil test and does not prove current site condition, contamination status, biological activity, or crop performance.',
      source_updated_at: sourceUpdatedAt
    },
    metadata: {
      collector: 'faie_usda_soil_point_v1',
      retrieved_at: retrievedAt,
      source_timestamp_semantics: rows.some((row) => clean(row.saverest)) ? 'soil_survey_area_update' : 'retrieval_time_fallback',
      exact_point_supplied: true,
      field_verification_required_for_consequential_use: true
    }
  } : null;

  return {
    schema: 'evercraft.faie.usda-soil-collector.v1',
    source_id: 'usda-nrcs-soil-data-access',
    endpoint: SDA_ENDPOINT,
    retrieved_at: retrievedAt,
    latitude: lat,
    longitude: lon,
    row_count: rows.length,
    mapunit_count: mapunits.length,
    observation,
    receipt: {
      source_id: 'usda-nrcs-soil-data-access',
      status: mapunits.length ? 'ok' : 'empty',
      checked_at: retrievedAt,
      item_count: mapunits.length,
      evidence_state: 'REPORTED',
      source_updated_at: sourceUpdatedAt,
      field_verification_required: true
    }
  };
}

export const USDA_SOIL_DATA_ACCESS = Object.freeze({
  endpoint: SDA_ENDPOINT,
  help_url: SDA_HELP,
  advanced_query_url: SDA_ADVANCED
});
