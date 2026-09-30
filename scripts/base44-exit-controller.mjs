import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function analyzeExitEstate({
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
} = {}) {
  const migrationRoot = path.join(root, 'systemia/migrations/base44-exit');
  const observed = loadJson(path.join(migrationRoot, 'observed-estate-2026-09-30.json'));
  const estate = loadJson(path.join(migrationRoot, 'estate-snapshot.json'));
  const incident = loadJson(path.join(migrationRoot, 'emergency-evacuation-2026-09-30.json'));
  const sliceRoot = path.join(migrationRoot, 'slices');

  const slices = fs.readdirSync(sliceRoot)
    .filter((name) => name.endsWith('.json'))
    .map((name) => loadJson(path.join(sliceRoot, name)));

  if (!Array.isArray(observed.apps)) throw new Error('observed_estate_apps_missing');
  if (observed.apps.length < Number(estate.observed_apps_minimum || 0)) {
    throw new Error('observed_estate_below_minimum');
  }

  const ordinals = new Set();
  for (const app of observed.apps) {
    if (!String(app.name || '').trim()) throw new Error('observed_app_name_missing');
    if (!Number.isInteger(app.ordinal) || app.ordinal < 1) throw new Error('observed_app_ordinal_invalid');
    if (ordinals.has(app.ordinal)) throw new Error('observed_app_ordinal_duplicate');
    ordinals.add(app.ordinal);
    if (!['p0', 'p1', 'untriaged'].includes(app.risk_tier)) throw new Error('observed_app_risk_tier_invalid');
    if (!['migrate', 'triage_required', 'merge', 'archive', 'retire'].includes(app.disposition)) {
      throw new Error('observed_app_disposition_invalid');
    }
  }

  const queued = new Set((estate.queue || []).map((item) => normalize(item.product)));
  const sliced = new Set(slices.map((item) => normalize(item.product || item.slice)));
  const p0Sequence = (incident.p0_sequence || []).map((item) => normalize(item.product));

  const coverage = observed.apps.map((app) => {
    const key = normalize(app.name);
    const queueCovered = queued.has(key);
    const sliceCovered = sliced.has(key);
    const incidentCovered = p0Sequence.some((item) => item && (item.includes(key) || key.includes(item)));
    return {
      name: app.name,
      ordinal: app.ordinal,
      risk_tier: app.risk_tier,
      disposition: app.disposition,
      queue_covered: queueCovered,
      slice_covered: sliceCovered,
      incident_covered: incidentCovered,
      active_migration_covered: queueCovered || sliceCovered || incidentCovered,
    };
  });

  const p0 = coverage.filter((item) => item.risk_tier === 'p0');
  const p0Uncovered = p0.filter((item) => !item.active_migration_covered);
  const triageRequired = coverage.filter((item) => item.disposition === 'triage_required');

  return {
    schema: 'evercraft.systemia.base44-exit-controller.v1',
    observed_apps: observed.apps.length,
    observed_minimum: estate.observed_apps_minimum,
    queued_products: (estate.queue || []).length,
    migration_slices: slices.length,
    p0_apps: p0.length,
    p0_uncovered: p0Uncovered,
    triage_required: triageRequired.length,
    coverage,
    healthy: p0Uncovered.length === 0 && observed.apps.length >= Number(estate.observed_apps_minimum || 0),
  };
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const result = analyzeExitEstate();
  process.stdout.write(JSON.stringify({
    schema: result.schema,
    observed_apps: result.observed_apps,
    observed_minimum: result.observed_minimum,
    queued_products: result.queued_products,
    migration_slices: result.migration_slices,
    p0_apps: result.p0_apps,
    p0_uncovered: result.p0_uncovered.map((item) => item.name),
    triage_required: result.triage_required,
    healthy: result.healthy,
  }, null, 2) + '\n');
  if (!result.healthy) process.exit(1);
}
