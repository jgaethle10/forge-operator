// Evercraft Watershed Intelligence: non-publishing, human-review-only brief compiler.
// Input is a source-canary JSON snapshot. Publication/payment authority is NEVER inferred.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { WATERSHED_SCHEMA, evaluateWatershedCoverage } from './watershed-intelligence.mjs';

function safe(value) {
  return String(value ?? 'unknown').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/[\[\]|*<>]/g, '').slice(0, 250);
}
function fmt(row) {
  if (!row || !Number.isFinite(row.value)) return 'not available';
  return String(row.value) + ' ' + safe(row.unit || 'units') + ' (' + safe(row.freshness) + ')';
}

export function formatWatershedReviewBrief(snapshot, profile, inputSha256 = null) {
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
  lines.push('', '## Interpretation and limitations', '',
    '- These are individual sensor observations, not basin-weighted statistics.',
    '- October snowpack percentages can have unusually small climatological denominators.',
    '- Percentage of normal: **not calculated**. Same-date official WTEQ normals and basin aggregation rules are not yet validated.',
    '- Yakima reservoir storage: **not connected**. The Bureau of Reclamation provides official reservoir resources, but they are not yet ingested by this collector.',
    '- Water supply outlook, irrigation allocation and flood threat: **not inferred**.',
    '- A provisional USGS sensor reading is an observation, not an independently approved value.',
    '- A successful data connection is not proof of basin coverage, data correctness, or authorization to publish.',
    '',
    '## Official source provenance', '',
    '- NRCS AWDB daily WTEQ/SNWD: https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data',
    '- USGS Water Data continuous observations: https://api.waterdata.usgs.gov/',
    '- Yakima Bureau of Reclamation Hydromet (reference only): https://www.usbr.gov/pn/hydromet/yakima/',
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
  if (args.length !== 4 || args[0] !== '--input' || args[2] !== '--out') {
    process.stderr.write('Usage: node watershed-review-brief.mjs --input SNAPSHOT.json --out BRIEF.md\n');
    process.exitCode = 2;
  } else {
    try {
      const bytes = readFileSync(args[1]);
      const snapshot = JSON.parse(bytes.toString('utf8'));
      const profile = JSON.parse(readFileSync(new URL('./watershed-yakima-profile.json', import.meta.url), 'utf8'));
      const sha = createHash('sha256').update(bytes).digest('hex');
      const report = formatWatershedReviewBrief(snapshot, profile, sha);
      writeFileSync(args[3], report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    } catch (error) {
      process.stderr.write('Draft research compilation failed: ' + String(error?.message || error).slice(0, 140) + '\n');
      process.exitCode = 1;
    }
  }
}
