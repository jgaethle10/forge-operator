import crypto from "node:crypto";
import { normalizeContextObservation } from "../worldstate/observation-fabric.mjs";

const RANGE_MAP = Object.freeze({
  weather: {
    themes: ["energy_demand", "transport_disruption", "insurance_loss", "consumer_demand"],
    instruments: ["XLE", "XLU", "IYT", "JETS", "XLP"],
  },
  wildfire_smoke: {
    themes: ["utility_risk", "insurance_loss", "air_quality_disruption", "regional_demand"],
    instruments: ["XLU", "KIE", "IYT"],
  },
  water: {
    themes: ["agriculture_supply", "utility_stress", "industrial_input"],
    instruments: ["DBA", "MOO", "XLU", "XLI"],
  },
  cryosphere: {
    themes: ["water_supply", "hydropower", "agriculture_supply"],
    instruments: ["XLU", "DBA", "MOO"],
  },
  ocean_coastal: {
    themes: ["shipping_disruption", "insurance_loss", "energy_logistics"],
    instruments: ["IYT", "KIE", "XLE"],
  },
  aviation: {
    themes: ["airline_operations", "travel_demand", "transport_disruption"],
    instruments: ["JETS", "IYT"],
  },
  maritime: {
    themes: ["shipping_flow", "port_congestion", "supply_chain"],
    instruments: ["IYT", "XLI", "XLY", "XLP"],
  },
  grid_energy: {
    themes: ["power_demand", "grid_stress", "generation_mix", "fuel_demand"],
    instruments: ["XLU", "XLE"],
  },
  transportation: {
    themes: ["freight_flow", "mobility", "industrial_activity"],
    instruments: ["IYT", "XLI"],
  },
  telecom: {
    themes: ["network_reliability", "communications_demand"],
    instruments: ["XLC"],
  },
  cyber: {
    themes: ["cyber_incident", "security_spend", "operational_disruption"],
    instruments: ["CIBR", "HACK", "QQQ"],
  },
  ai_models: {
    themes: ["ai_capability", "compute_demand", "software_cycle"],
    instruments: ["QQQ", "SMH", "SOXX"],
  },
  robotics: {
    themes: ["automation_capex", "industrial_productivity"],
    instruments: ["XLI", "BOTZ"],
  },
  semiconductors_compute: {
    themes: ["chip_supply", "compute_demand", "fab_capacity"],
    instruments: ["SMH", "SOXX", "QQQ"],
  },
  industrial_manufacturing: {
    themes: ["industrial_output", "capex", "factory_disruption"],
    instruments: ["XLI"],
  },
  supply_chain: {
    themes: ["inventory_flow", "freight_cost", "retail_supply"],
    instruments: ["IYT", "XLI", "XLY", "XLP"],
  },
  agriculture_food: {
    themes: ["crop_supply", "food_input_cost", "agriculture_output"],
    instruments: ["DBA", "MOO", "XLP"],
  },
  public_health: {
    themes: ["healthcare_demand", "workforce_absence", "consumer_behavior"],
    instruments: ["XLV", "XLP", "SPY"],
  },
  economy_labor: {
    themes: ["growth", "labor_demand", "rates_sensitivity", "consumer_demand"],
    instruments: ["SPY", "QQQ", "IWM", "XLF", "XLY"],
  },
  housing_construction: {
    themes: ["housing_activity", "building_materials", "rates_sensitivity"],
    instruments: ["XHB", "ITB", "XLB"],
  },
  public_policy_regulation: {
    themes: ["regulatory_change", "sector_policy"],
    instruments: ["SPY"],
  },
  space_weather: {
    themes: ["satellite_risk", "grid_risk", "communications_disruption"],
    instruments: ["XLU", "XLC"],
  },
  independent_scouts: {
    themes: ["uncategorized_public_signal"],
    instruments: ["SPY", "QQQ"],
  },
});

const DOMAIN_TO_RANGE = Object.freeze({
  weather: "weather",
  climate: "weather",
  water: "water",
  ocean: "ocean_coastal",
  aviation: "aviation",
  maritime: "maritime",
  transport: "transportation",
  energy: "grid_energy",
  infrastructure: "grid_energy",
  telecom: "telecom",
  cyber: "cyber",
  ai: "ai_models",
  robotics: "robotics",
  semiconductors: "semiconductors_compute",
  industrial: "industrial_manufacturing",
  supply_chain: "supply_chain",
  agriculture: "agriculture_food",
  food: "agriculture_food",
  public_health: "public_health",
  economy: "economy_labor",
  labor: "economy_labor",
  housing: "housing_construction",
  construction: "housing_construction",
  regulation: "public_policy_regulation",
  public_policy: "public_policy_regulation",
  space_weather: "space_weather",
});

const DEFAULT_LAGS = Object.freeze([
  { key: "15m", minutes: 15 },
  { key: "1h", minutes: 60 },
  { key: "1d", minutes: 390 },
  { key: "3d", minutes: 1170 },
  { key: "5d", minutes: 1950 },
]);

function stableHash(value) {
  return crypto.createHash("sha256").update(
    typeof value === "string" ? value : JSON.stringify(value)
  ).digest("hex").slice(0, 24);
}

function uniq(values) {
  return [...new Set((values || []).map((v) => String(v || "").trim()).filter(Boolean))];
}

function inferredRanges(observation, explicitRange) {
  const ranges = [];
  if (explicitRange && RANGE_MAP[explicitRange]) ranges.push(explicitRange);
  const metaRange = String(observation.metadata?.rockies_range || observation.metadata?.range || "").trim();
  if (metaRange && RANGE_MAP[metaRange]) ranges.push(metaRange);

  const explicit = uniq(ranges);
  const allowDomainExpansion = observation.metadata?.allow_domain_range_expansion === true;
  if (explicit.length && !allowDomainExpansion) return explicit;

  for (const domain of observation.domains || []) {
    const match = DOMAIN_TO_RANGE[String(domain).toLowerCase()];
    if (match) ranges.push(match);
  }
  return uniq(ranges);
}

export function rockiesObservationToEdgeHypotheses(rawObservation, {
  rockies_range = null,
  independent_source_family_count = 1,
  lags = DEFAULT_LAGS,
} = {}) {
  const observation = normalizeContextObservation(rawObservation);
  const ranges = inferredRanges(observation, rockies_range);

  if (!ranges.length) return [];
  if (observation.anomaly_score < 0.25) return [];

  const corroborationCount = Math.max(1, Number(independent_source_family_count || 1));
  const evidenceWeight = observation.evidence_state === "verified"
    ? 1
    : observation.evidence_state === "observed"
      ? 0.9
      : observation.evidence_state === "reported"
        ? 0.65
        : 0.45;

  return ranges.map((range) => {
    const spec = RANGE_MAP[range];
    const directMarketSymbols = uniq(observation.metadata?.market_symbols || [])
      .map((symbol) => symbol.toUpperCase())
      .filter((symbol) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol));
    const priorityScore = Math.max(0, Math.min(1,
      observation.anomaly_score *
      observation.reliability *
      evidenceWeight *
      Math.min(1.25, 0.75 + corroborationCount * 0.125)
    ));

    const identity = {
      observation_id: observation.observation_id,
      range,
      observed_at: observation.observed_at,
      source_family: observation.source_family,
    };

    return {
      schema: "evercraft.daytrade.rockies-edge-hypothesis.v1",
      hypothesis_id: "edgehyp:" + stableHash(identity),
      source_observation_id: observation.observation_id,
      observed_at: observation.observed_at,
      rockies_range: range,
      observation_kind: observation.kind,
      observation_domains: [...observation.domains],
      region_keys: [...observation.region_keys],
      themes: [...spec.themes],
      research_instruments: uniq([...directMarketSymbols, ...spec.instruments]),
      lag_windows: lags.map((x) => ({ ...x })),
      direction: "LEARN_FROM_DATA",
      benchmark_policy: "instrument_vs_SPY_and_sector_peer",
      anomaly_score: observation.anomaly_score,
      source_reliability: observation.reliability,
      evidence_state: observation.evidence_state,
      independent_source_family_count: corroborationCount,
      research_priority_score: priorityScore,
      provenance_refs: [...observation.provenance_refs],
      source_family: observation.source_family,
      origin_entity_ref: observation.metadata?.origin_entity_ref || null,
      source_authority_class: observation.metadata?.authority_class || null,
      sec_items: Array.isArray(observation.facts?.items)
        ? [...observation.facts.items]
        : [],
      source_form: observation.facts?.form || null,
      source_ticker: observation.facts?.ticker || null,
      summary: observation.summary,
      constraints: {
        no_live_trade_instruction: true,
        no_direction_precommitment: true,
        preserve_observation_timestamp: true,
        preserve_provenance: true,
        require_holdout_validation: true,
        require_transaction_cost_stress: true,
        require_multiple_testing_control: true,
      },
    };
  });
}

function mean(values) {
  return values.length ? values.reduce((a,b) => a + b, 0) / values.length : 0;
}

function median(values) {
  if (!values.length) return 0;
  const x = [...values].sort((a,b) => a-b);
  const m = Math.floor(x.length / 2);
  return x.length % 2 ? x[m] : (x[m-1] + x[m]) / 2;
}

function stats(samples, costBps, expectedSign = null) {
  const excess = samples.map((row) =>
    Number(row.forward_return || 0) - Number(row.benchmark_return || 0)
  );
  const rawAvg = mean(excess);
  const rawSign = rawAvg > 0 ? 1 : rawAvg < 0 ? -1 : 0;
  const direction = expectedSign === 1 || expectedSign === -1 ? expectedSign : rawSign;
  const cost = Number(costBps || 0) / 10000;
  const net = direction === 0
    ? [...excess]
    : excess.map((x) => x - direction * cost);
  const strategyNet = direction === 0
    ? excess.map(() => 0)
    : excess.map((x) => direction * x - cost);
  const avg = mean(net);
  const med = median(net);
  const sign = avg > 0 ? 1 : avg < 0 ? -1 : 0;
  const aligned = strategyNet.filter((x) => x > 0).length;
  const variance = net.length > 1
    ? net.reduce((sum, x) => sum + (x - avg) ** 2, 0) / (net.length - 1)
    : 0;
  const standardError = net.length > 0 ? Math.sqrt(variance / net.length) : Infinity;
  const tLike = Number.isFinite(standardError) && standardError > 0 ? avg / standardError : 0;

  return {
    samples: net.length,
    expected_sign: direction,
    raw_mean_excess_return: rawAvg,
    raw_sign: rawSign,
    mean_excess_return_net: avg,
    median_excess_return_net: med,
    mean_strategy_return_net: mean(strategyNet),
    directional_hit_rate: net.length ? aligned / net.length : 0,
    t_like: tLike,
    sign,
  };
}

export function evaluateRockiesEdgeCandidate(samples, {
  transaction_cost_bps = 5,
  development_fraction = 0.7,
  minimum_samples = 40,
  minimum_holdout_samples = 10,
  minimum_abs_holdout_mean_bps = 8,
} = {}) {
  const rows = [...(samples || [])]
    .filter((row) =>
      Number.isFinite(Number(row.forward_return)) &&
      Number.isFinite(Number(row.benchmark_return)) &&
      row.observed_at
    )
    .sort((a,b) => new Date(a.observed_at) - new Date(b.observed_at));

  const splitAt = Math.max(1, Math.floor(rows.length * development_fraction));
  const developmentRaw = stats(rows.slice(0, splitAt), 0);
  const learnedSign = developmentRaw.raw_sign;
  const development = stats(rows.slice(0, splitAt), transaction_cost_bps, learnedSign);
  const holdout = stats(rows.slice(splitAt), transaction_cost_bps, learnedSign);
  const overall = stats(rows, transaction_cost_bps, learnedSign);

  const signAgreement =
    learnedSign !== 0 &&
    development.sign === learnedSign &&
    holdout.sign === learnedSign;

  const holdoutMagnitudePass =
    holdout.mean_strategy_return_net >= minimum_abs_holdout_mean_bps / 10000;

  const checks = {
    minimum_total_sample: rows.length >= minimum_samples,
    minimum_holdout_sample: holdout.samples >= minimum_holdout_samples,
    train_holdout_sign_agreement: signAgreement,
    development_strategy_return_positive_after_costs:
      development.mean_strategy_return_net > 0,
    holdout_effect_survives_costs: holdoutMagnitudePass,
    holdout_strategy_return_positive_after_costs:
      holdout.mean_strategy_return_net > 0,
    holdout_directional_hit_rate_above_half: holdout.directional_hit_rate > 0.5,
  };

  const candidate = Object.values(checks).every(Boolean);

  return {
    schema: "evercraft.daytrade.rockies-edge-evaluation.v1",
    status: candidate ? "RESEARCH_CANDIDATE" : "NOT_VALIDATED",
    edge_claimed: false,
    live_trade_authority: false,
    transaction_cost_bps,
    development,
    holdout,
    overall,
    learned_direction: candidate ? (learnedSign > 0 ? "POSITIVE_EXCESS_RETURN" : "NEGATIVE_EXCESS_RETURN") : "UNRESOLVED",
    checks,
    research_note: candidate
      ? "Candidate survived this holdout screen; further regime, multiple-testing, and forward-paper validation remain required."
      : "Do not promote; the candidate did not survive the current holdout screen.",
  };
}

export function marketRelevantRockiesRanges() {
  return Object.entries(RANGE_MAP).map(([range, spec]) => ({
    range,
    themes: [...spec.themes],
    research_instruments: [...spec.instruments],
  }));
}
