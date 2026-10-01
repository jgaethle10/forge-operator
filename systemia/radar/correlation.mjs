import crypto from 'node:crypto';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = (values = []) => [...new Set((Array.isArray(values) ? values : [values]).map(clean).filter(Boolean))];
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);

function timeMs(value) {
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : null;
}

function sharedNonGlobalRegion(a, b) {
  const left = new Set((a.region_keys || []).map((x) => clean(x).toLowerCase()).filter((x) => x && x !== 'global'));
  return (b.region_keys || []).some((x) => left.has(clean(x).toLowerCase()));
}

function sharedCorrelationKey(a, b) {
  const left = new Set((a.correlation_keys || []).map((x) => clean(x).toLowerCase()).filter(Boolean));
  return (b.correlation_keys || []).some((x) => left.has(clean(x).toLowerCase()));
}

function canRelate(a, b, windowMs) {
  const aTime = timeMs(a.observed_at);
  const bTime = timeMs(b.observed_at);
  if (aTime == null || bTime == null || Math.abs(aTime - bTime) > windowMs) return false;
  return sharedNonGlobalRegion(a, b) || sharedCorrelationKey(a, b);
}

function connectedComponents(signals, windowMs) {
  const graph = signals.map(() => new Set());
  for (let i = 0; i < signals.length; i += 1) {
    for (let j = i + 1; j < signals.length; j += 1) {
      if (!canRelate(signals[i], signals[j], windowMs)) continue;
      graph[i].add(j);
      graph[j].add(i);
    }
  }

  const seen = new Set();
  const components = [];
  for (let i = 0; i < signals.length; i += 1) {
    if (seen.has(i)) continue;
    const queue = [i];
    const component = [];
    seen.add(i);
    while (queue.length) {
      const index = queue.shift();
      component.push(signals[index]);
      for (const neighbor of graph[index]) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
    components.push(component);
  }
  return components;
}

export function buildPropagationCandidates(signals = [], {
  time_window_hours = 48,
  min_signals = 2,
  min_domains = 2
} = {}) {
  const rows = (signals || []).filter(Boolean);
  if (rows.length < min_signals) return [];

  const windowMs = Math.max(1, Number(time_window_hours) || 48) * 60 * 60 * 1000;
  const components = connectedComponents(rows, windowMs);
  const candidates = [];

  for (const component of components) {
    if (component.length < min_signals) continue;
    const domains = unique(component.flatMap((row) => row.domains || [])).sort();
    if (domains.length < min_domains) continue;

    const regions = unique(component.flatMap((row) => row.region_keys || []).filter((x) => clean(x).toLowerCase() !== 'global')).sort();
    const correlationKeys = unique(component.flatMap((row) => row.correlation_keys || [])).sort();
    const sourceFamilies = unique(component.map((row) => row.source_family)).sort();
    const times = component.map((row) => timeMs(row.observed_at)).filter((value) => value != null).sort((a, b) => a - b);
    const maxMateriality = Math.max(...component.map((row) => Number(row.materiality_score || 0)));
    const avgMateriality = component.reduce((sum, row) => sum + Number(row.materiality_score || 0), 0) / component.length;

    const body = {
      signals: component.map((row) => row.signal_id).sort(),
      domains,
      regions,
      correlation_keys: correlationKeys,
      time_window_hours
    };

    candidates.push({
      schema: 'evercraft.systemia-radar.propagation-candidate.v1',
      propagation_id: `radar-propagation:${hash(body)}`,
      relationship_state: 'co_occurrence_candidate',
      truth_state: 'INFERRED',
      causal_claim: false,
      signal_ids: component.map((row) => row.signal_id),
      domains,
      region_keys: regions,
      correlation_keys: correlationKeys,
      independent_source_families: sourceFamilies.length,
      source_families: sourceFamilies,
      first_observed_at: times.length ? new Date(times[0]).toISOString() : null,
      last_observed_at: times.length ? new Date(times[times.length - 1]).toISOString() : null,
      max_materiality: Number(maxMateriality.toFixed(3)),
      average_materiality: Number(avgMateriality.toFixed(3)),
      explanation: 'These signals co-occur within the configured time and context boundary. Radar is flagging a relationship candidate for investigation, not asserting that one signal caused another.',
      what_would_change_this: 'Direct source evidence, a documented mechanism, or repeated temporal ordering across independent observations would be required before promoting this relationship beyond inference.'
    });
  }

  return candidates.sort((a, b) =>
    b.max_materiality - a.max_materiality ||
    b.independent_source_families - a.independent_source_families
  );
}
