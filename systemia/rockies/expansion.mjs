import fs from 'node:fs';

const topology = JSON.parse(fs.readFileSync(new URL('./roster.json', import.meta.url), 'utf8'));

const clean = (v) => String(v ?? '').trim();

export function getTopology() {
  return structuredClone(topology);
}

export function summarizeTopology(input = topology) {
  const ranges = input.ranges || [];
  return {
    schema: 'evercraft.rockies.topology-summary.v1',
    range_count: ranges.length,
    baseline_agents: ranges.reduce((sum, row) => sum + Number(row.baseline_agents || 0), 0),
    distinct_source_families: new Set(ranges.flatMap((row) => row.source_families || [])).size,
    domains: [...new Set(ranges.flatMap((row) => row.domains || []))].sort(),
    cadence_classes: [...new Set(ranges.map((row) => row.cadence))].sort(),
    max_surge_agents: Number(input.scaling?.max_surge_agents || 0)
  };
}

export function rangeByName(name, input = topology) {
  const key = clean(name).toLowerCase();
  return (input.ranges || []).find((row) => row.range.toLowerCase() === key) || null;
}

export function planRockyAllocation({
  range,
  anomaly_score = 0,
  independent_source_families = 1,
  stale_source_families = 0,
  corroboration_requested = false,
  topologyOverride = topology
} = {}) {
  const spec = rangeByName(range, topologyOverride);
  if (!spec) throw new Error(`unknown Rockies range: ${range}`);

  const baseline = Number(spec.baseline_agents || 1);
  const maxGlobal = Number(topologyOverride.scaling?.max_surge_agents || baseline);
  const anomaly = Math.max(0, Math.min(1, Number(anomaly_score || 0)));
  const families = Math.max(0, Number(independent_source_families || 0));
  const stale = Math.max(0, Number(stale_source_families || 0));

  let multiplier = 1;
  const reasons = [];

  if (anomaly >= 0.8) {
    multiplier += 2;
    reasons.push('high_anomaly');
  } else if (anomaly >= 0.6) {
    multiplier += 1;
    reasons.push('elevated_anomaly');
  }

  if (corroboration_requested || families < Number(topologyOverride.doctrine?.independent_source_family_target || 2)) {
    multiplier += 1;
    reasons.push('needs_independent_corroboration');
  }

  if (stale > 0) {
    multiplier += Math.min(2, stale);
    reasons.push('source_family_stale');
  }

  const sourceFamilyCeiling = Math.max(
    baseline,
    (spec.source_families || []).length * 4
  );

  const allocated_agents = Math.min(
    maxGlobal,
    sourceFamilyCeiling,
    Math.max(baseline, Math.ceil(baseline * multiplier))
  );

  return {
    schema: 'evercraft.rockies.allocation-plan.v1',
    range: spec.range,
    cadence: spec.cadence,
    baseline_agents: baseline,
    allocated_agents,
    multiplier,
    reasons,
    source_family_count: (spec.source_families || []).length,
    domains: [...spec.domains],
    mode: allocated_agents > baseline ? 'surge' : 'baseline',
    rule: 'Scale attention without pretending duplicate reads are independent evidence.'
  };
}
