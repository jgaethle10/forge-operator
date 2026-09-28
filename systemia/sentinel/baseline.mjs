const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));

function cleanText(value, name) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(name + ' must be non-empty');
  return text;
}

export function emptyBaselineState() {
  return {
    schema: 'systemia.sentinel.baseline-state.v1',
    series: {}
  };
}

export function seriesKey(sample) {
  return [
    cleanText(sample.region_key, 'region_key'),
    cleanText(sample.domain, 'domain'),
    cleanText(sample.kind || 'metric', 'kind')
  ].join('|');
}

function statsAfter(stats, value) {
  const count = (stats?.count || 0) + 1;
  const priorMean = stats?.mean || 0;
  const delta = value - priorMean;
  const mean = priorMean + delta / count;
  const delta2 = value - mean;
  const m2 = (stats?.m2 || 0) + delta * delta2;
  const variance = count > 1 ? m2 / (count - 1) : 0;
  return {
    count,
    mean,
    m2,
    variance,
    stddev: Math.sqrt(Math.max(0, variance)),
    min: stats?.count ? Math.min(stats.min, value) : value,
    max: stats?.count ? Math.max(stats.max, value) : value,
    last_value: value
  };
}

export function scoreAgainstBaseline(state, sample, options = {}) {
  const next = structuredClone(state || emptyBaselineState());
  const key = seriesKey(sample);
  const value = Number(sample.value);
  if (!Number.isFinite(value)) throw new TypeError('sample.value must be finite');

  const minSamples = options.minSamples ?? 8;
  const watchZ = options.watchZ ?? 2.5;
  const urgentZ = options.urgentZ ?? 6;
  const floorStddev = Math.max(1e-9, Number(options.floorStddev ?? 1e-6));
  const freezeAboveScore = Math.max(0, Math.min(1, Number(options.freezeAboveScore ?? 0.6)));
  const prior = next.series[key] || null;

  let zScore = 0;
  let anomalyScore = 0;
  let baselineReady = false;

  if (prior && prior.count >= minSamples) {
    baselineReady = true;
    const spread = Math.max(prior.stddev || 0, floorStddev);
    zScore = Math.abs((value - prior.mean) / spread);
    anomalyScore = zScore <= watchZ
      ? 0
      : clamp01((zScore - watchZ) / Math.max(0.001, urgentZ - watchZ));
  }

  const baselineUpdated = !baselineReady || anomalyScore < freezeAboveScore;
  if (baselineUpdated) {
    next.series[key] = {
      ...statsAfter(prior, value),
      updated_at: sample.created_at || new Date().toISOString()
    };
  } else {
    next.series[key] = {
      ...prior,
      updated_at: prior.updated_at || sample.created_at || new Date().toISOString(),
      last_deviation_at: sample.created_at || new Date().toISOString(),
      last_deviation_value: value
    };
  }

  return {
    state: next,
    result: {
      schema: 'systemia.sentinel.baseline-score.v1',
      key,
      baseline_ready: baselineReady,
      sample_value: value,
      baseline_count: prior?.count || 0,
      baseline_mean: prior?.mean ?? null,
      baseline_stddev: prior?.stddev ?? null,
      z_score: Number(zScore.toFixed(3)),
      anomaly_score: Number(anomalyScore.toFixed(3)),
      baseline_updated: baselineUpdated,
      baseline_update_reason: baselineUpdated ? 'normal_learning' : 'strong_deviation_frozen',
      state: baselineReady ? (anomalyScore > 0 ? 'deviation' : 'normal') : 'learning'
    }
  };
}
