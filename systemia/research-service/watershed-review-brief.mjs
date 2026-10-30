// Evercraft Watershed Intelligence: non-publishing, human-review-only brief compiler.
// Input is a source-canary JSON snapshot. Publication/payment authority is NEVER inferred.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { WATERSHED_SCHEMA, evaluateWatershedCoverage } from './watershed-intelligence.mjs';
import { YAKIMA_RESERVOIR_SITES } from './usbr-rise-reservoirs.mjs';

function safe(value) {
  return String(value ?? 'unknown').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/[\[\]|*<>]/g, '').slice(0, 250);
}
function fmt(row) {
  if (!row || !Number.isFinite(row.value)) return 'not available';
  return String(row.value) + ' ' + safe(row.unit || 'units') + ' (' + safe(row.freshness) + ')';
}

export function formatWatershedReviewBrief(snapshot, profile, inputSha256 = null, reservoirSnapshot = null, reservoirSha256 = null) {
  if (!snapshot || snapshot.schema !== WATERSHED_SCHEMA || snapshot.region !== 'yakima-basin-wa') {
    throw new TypeError('verified Yakima snapshot schema is required');
  }
  if (profile?.profile_id !== 'yakima-basin-wa' ||
      !Array.isArray(profile.snow_stations) || !Array.isArray(profile.river_location_ids)) {
    throw new TypeError('matching Yakima source profile is required');
  }
  const coverage = evaluateWatershedCoverage(snapshot);
  const bySnow = new Map();
  for (const r of snapshot.snow || []) {
    if (!bySnow.has(r.station_id)) bySnow.set(r.station_id, {});
    if (r.kind === 'WTEQ' || r.kind === 'SNWD') bySnow.get(r.station_id)[r.kind] = r;
  }
  const byRiver = new Map();
  for (const r of snapshot.river || []) {
    if (r.kind === 'stream_discharge') byRiver.set(r.station_id, r);
  }
  const lines = [
    '# Evercraft Research | Yakima Watershed Intelligence',
    '',
    '**REVIEW DRAFT. NOT A PUBLISHED WATER-SUPPLY FORECAST OR CUSTOMER REPORT.**',
    '',
    '**Snapshot collected:** ' + safe(snapshot.as_of),
    '**Sensor connectivity:** ' + safe(coverage.status) + ' (minimum source health, not basin-wide representation)',
    '**Data state:** ' + safe(snapshot.status),
    '**Source failures:** ' + (snapshot.failures?.length ? snapshot.failures.map(x=>safe(x.source)).join(', ') : 'none reported'),
    '',
    '## Snowpack observations',
    '',
    '| NRCS SNOTEL site | Latest snow depth | Snow water equivalent | Observation date |',
    '|---|---:|---:|---|'
  ];
  for (const station of profile.snow_stations) {
    const rows = bySnow.get(station.triplet) || {};
    lines.push('| ' + safe(station.name) + ' (' + safe(station.triplet) + ') | ' +
      fmt(rows.SNWD) + ' | ' + fmt(rows.WTEQ) + ' | ' +
      safe(rows.WTEQ?.time || rows.SNWD?.time || 'missing') + ' |');
  }
  lines.push('', '## River discharge observations', '',
    '| USGS monitoring location | Latest discharge | Observation timestamp | Evidence state |',
    '|---|---:|---|---|');
  for (const id of profile.river_location_ids) {
    const row = byRiver.get(id);
    lines.push('| ' + safe(id) + ' | ' + fmt(row) + ' | ' +
      safe(row?.time || 'missing') + ' | ' + safe(row?.state || 'missing') + ' |');
  }
  lines.push('', '## Bureau of Reclamation reservoir observations', '');
  if (reservoirSnapshot) {
    if (reservoirSnapshot.source_id !== 'usbr-rise-edr-reservoir-storage' ||
        !Array.isArray(reservoirSnapshot.observations)) {
      throw new TypeError('invalid USBR reservoir source receipt');
    }
    const byReservoir = new Map(reservoirSnapshot.observations.map(row => [row.station_id, row]));
    const comparableRows = YAKIMA_RESERVOIR_SITES.map(site => {
      const row = byReservoir.get(site.code);
      return row?.catalog_item_id===site.catalog_item_id && row.unit==='af' &&
        Number.isFinite(row.value) && row.value>=0 &&
        ['current','recent_daily_time_zone_unresolved'].includes(row.freshness) &&
        /^\d{4}-\d\d-\d\d$/.test(row.source_day_reported||'') ? row : null;
    });
    const sameDay = comparableRows.every(Boolean) &&
      new Set(comparableRows.map(row=>row.source_day_reported)).size===1;
    const recomputedSum = sameDay ? comparableRows.reduce((sum,row)=>sum+row.value,0) : null;
    if (Number.isFinite(reservoirSnapshot.derived_provisional_sum_af) &&
        (recomputedSum===null || reservoirSnapshot.derived_provisional_sum_af!==recomputedSum ||
          reservoirSnapshot.derived_sum_source_reported_day!==comparableRows[0].source_day_reported)) {
      throw new TypeError('RISE five-reservoir arithmetic receipt mismatch');
    }
    lines.push('**RISE source state:** ' + safe(reservoirSnapshot.status),
      '**Fresh sites:** ' + safe(reservoirSnapshot.current_station_count) + '/5',
      '**Upstream failures:** ' + safe(reservoirSnapshot.failures?.length ?? 'not assessed'),
      '',
      '| Reservoir | Storage (acre-feet) | Source-reported date | Status |',
      '|---|---:|---|---|');
    for (const site of YAKIMA_RESERVOIR_SITES) {
      const reading=byReservoir.get(site.code);
      const usable=reading && reading.catalog_item_id===site.catalog_item_id &&
        reading.unit==='af' && Number.isFinite(reading.value);
      lines.push('| ' + safe(site.name) + ' (' + site.code + ') | ' +
        (usable ? safe(reading.value) : 'not available') + ' | ' +
        safe(reading?.source_day_reported || 'unknown') + ' | ' +
        safe(reading?.freshness || 'missing') + ' |');
    }
    lines.push('', '**Provisional five-reservoir arithmetic sum:** ' +
      (recomputedSum !== null
        ? safe(recomputedSum) + ' acre-feet, source-reported ' +
          safe(comparableRows[0].source_day_reported)
        : 'not computed; source coverage or date comparability incomplete') + '.',
      'This is an arithmetic sum of provisional observed volumes, NOT percent full, official operational storage or a water-supply forecast.',
      'Source-reported timestamps may omit timezone. Reporting day reconciliation and human review remain required.',
      ...(reservoirSha256 ? ['**Exact RISE diagnostic JSON SHA-256:** '+safe(reservoirSha256)] : []));
  } else {
    lines.push('No independently admitted reservoir source receipt. Storage observations are not available for this review draft.');
  }
  lines.push('', '## Interpretation and limitations', '',
    '- These are individual sensor observations, not basin-weighted statistics.',
    '- October snowpack percentages can have unusually small climatological denominators.',
    '- Percentage of normal: **not calculated**. Same-date official WTEQ normals and basin aggregation rules are not yet validated.',
    reservoirSnapshot ? '- USBR RISE observed storage is shown as an independent provisional source lane; human review, same-day reconciliation and official totals remain outstanding.' : '- Yakima reservoir storage: **not connected** to this report.',
    '- Water supply outlook, irrigation allocation and flood threat: **not inferred**.',
    '- A provisional USGS sensor reading is an observation, not an independently approved value.',
    '- A successful data connection is not proof of basin coverage, data correctness, or authorization to publish.',
    '',
    '## Official source provenance', '',
    '- NRCS AWDB daily WTEQ/SNWD: https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data',
    '- USGS Water Data continuous observations: https://api.waterdata.usgs.gov/',
    '- USBR RISE observed daily reservoir storage catalog: https://data.usbr.gov/',
    ...(inputSha256 ? ['- Exact canary JSON SHA-256: ' + safe(inputSha256)] : []),
    '',
    '## Outstanding verification holds', '',
    ...((snapshot.holds || []).length ? snapshot.holds.map(v => '- ' + safe(v)) : ['- None listed, but independent review and publication authorization remain required.']),
    '',
    '**Release state:** human review required; publication_authorized=false; payment_verified=false; delivery_authorized=false.',
    ''
  );
  return lines.join('\n');
}

if (process.argv[1]?.endsWith('watershed-review-brief.mjs') && process.argv.length > 2) {
  const args = process.argv.slice(2);
  if (![4,6].includes(args.length) || args[0] !== '--input' || args[2] !== '--out' || (args.length===6 && args[4] !== '--reservoir-input')) {
    process.stderr.write('Usage: node watershed-review-brief.mjs --input SNAPSHOT.json --out BRIEF.md [--reservoir-input RISE.json]\n');
    process.exitCode = 2;
  } else {
    try {
      const bytes = readFileSync(args[1]);
      const snapshot = JSON.parse(bytes.toString('utf8'));
      const profile = JSON.parse(readFileSync(new URL('./watershed-yakima-profile.json', import.meta.url), 'utf8'));
      const sha = createHash('sha256').update(bytes).digest('hex');
      const reservoirBytes = args.length === 6 ? readFileSync(args[5]) : null;
      const reservoir = reservoirBytes ? JSON.parse(reservoirBytes.toString('utf8')) : null;
      const reservoirSha = reservoirBytes ? createHash('sha256').update(reservoirBytes).digest('hex') : null;
      const report = formatWatershedReviewBrief(snapshot, profile, sha, reservoir, reservoirSha);
      writeFileSync(args[3], report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    } catch (error) {
      process.stderr.write('Draft research compilation failed: ' + String(error?.message || error).slice(0, 140) + '\n');
      process.exitCode = 1;
    }
  }
}
