import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  rockiesObservationToEdgeHypotheses,
  evaluateRockiesEdgeCandidate,
} from "./rockies-edge-fabric.mjs";

export const FIVE_MINUTE_LAG_BARS = Object.freeze({
  "15m": 3,
  "1h": 12,
  "1d": 78,
  "3d": 234,
  "5d": 390,
});

function sha(value) {
  return crypto.createHash("sha256").update(
    typeof value === "string" ? value : JSON.stringify(value)
  ).digest("hex");
}

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function normalizeBars(rows = []) {
  return rows
    .map((row) => ({
      t: row?.t || row?.timestamp,
      c: Number(row?.c ?? row?.close),
    }))
    .filter((row) => row.t && Number.isFinite(row.c) && row.c > 0)
    .sort((a,b) => new Date(a.t) - new Date(b.t));
}

function firstBarAtOrAfter(bars, timestamp) {
  const target = new Date(timestamp).getTime();
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (new Date(bars[mid].t).getTime() < target) lo = mid + 1;
    else hi = mid;
  }
  return lo < bars.length ? lo : -1;
}

function measuredReturn(bars, observedAt, lagBars) {
  const startIndex = firstBarAtOrAfter(bars, observedAt);
  if (startIndex < 0) return null;
  const endIndex = startIndex + lagBars;
  if (endIndex >= bars.length) return null;
  const start = bars[startIndex];
  const end = bars[endIndex];
  return {
    start_time: start.t,
    end_time: end.t,
    start_price: start.c,
    end_price: end.c,
    forward_return: end.c / start.c - 1,
    no_pre_observation_price_used: new Date(start.t) >= new Date(observedAt),
  };
}

export function measureRockiesHypotheses(hypotheses, barsBySymbol, {
  benchmark = "SPY",
  lagBars = FIVE_MINUTE_LAG_BARS,
} = {}) {
  const benchmarkBars = normalizeBars(barsBySymbol?.[benchmark] || []);
  const rows = [];

  for (const hypothesis of hypotheses || []) {
    for (const instrument of hypothesis.research_instruments || []) {
      const instrumentBars = normalizeBars(barsBySymbol?.[instrument] || []);
      if (!instrumentBars.length || !benchmarkBars.length) continue;

      for (const lag of hypothesis.lag_windows || []) {
        const bars = Number(lagBars[lag.key]);
        if (!Number.isFinite(bars) || bars <= 0) continue;

        const instrumentMove = measuredReturn(instrumentBars, hypothesis.observed_at, bars);
        const benchmarkMove = measuredReturn(benchmarkBars, hypothesis.observed_at, bars);
        if (!instrumentMove || !benchmarkMove) continue;
        if (!instrumentMove.no_pre_observation_price_used || !benchmarkMove.no_pre_observation_price_used) {
          throw new Error("edge_lab_lookahead_violation");
        }

        rows.push({
          schema: "evercraft.daytrade.edge-measurement.v1",
          measurement_id: "edgemeas:" + sha({
            hypothesis_id: hypothesis.hypothesis_id,
            instrument,
            lag: lag.key,
          }).slice(0,24),
          signal_key: [
            hypothesis.rockies_range,
            hypothesis.observation_kind || "observation",
            instrument,
            lag.key,
          ].join("|"),
          hypothesis_id: hypothesis.hypothesis_id,
          source_observation_id: hypothesis.source_observation_id,
          observed_at: hypothesis.observed_at,
          source_family: hypothesis.source_family,
          origin_entity_ref: hypothesis.origin_entity_ref || null,
          source_authority_class: hypothesis.source_authority_class || null,
          independent_source_family_count: hypothesis.independent_source_family_count,
          rockies_range: hypothesis.rockies_range,
          observation_kind: hypothesis.observation_kind || "observation",
          instrument,
          benchmark,
          lag_key: lag.key,
          lag_bars: bars,
          forward_return: instrumentMove.forward_return,
          benchmark_return: benchmarkMove.forward_return,
          excess_return: instrumentMove.forward_return - benchmarkMove.forward_return,
          instrument_start_time: instrumentMove.start_time,
          instrument_end_time: instrumentMove.end_time,
          benchmark_start_time: benchmarkMove.start_time,
          benchmark_end_time: benchmarkMove.end_time,
          provenance_refs: [...(hypothesis.provenance_refs || [])],
          evidence_state: hypothesis.evidence_state,
          anomaly_score: hypothesis.anomaly_score,
          source_reliability: hypothesis.source_reliability,
          research_only: true,
          live_trade_authority: false,
        });
      }
    }
  }

  return rows;
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
    t *
    Math.exp(-ax * ax)
  );
  return sign * y;
}

function approxTwoSidedNormalP(z) {
  const az = Math.abs(Number(z || 0));
  const cdf = 0.5 * (1 + erf(az / Math.SQRT2));
  return Math.max(0, Math.min(1, 2 * (1 - cdf)));
}

export function benjaminiHochberg(rows, {
  pField = "development_p_approx",
  qField = "development_q_bh",
} = {}) {
  const ranked = rows
    .map((row, index) => ({ row, index, p: Number(row[pField]) }))
    .filter((x) => Number.isFinite(x.p))
    .sort((a,b) => a.p - b.p);

  let running = 1;
  for (let i = ranked.length - 1; i >= 0; i--) {
    const rank = i + 1;
    const q = Math.min(running, ranked[i].p * ranked.length / rank);
    ranked[i].row[qField] = q;
    running = q;
  }
  for (const row of rows) {
    if (!Number.isFinite(Number(row[qField]))) row[qField] = 1;
  }
  return rows;
}

export function evaluateEdgeFamilies(measurements, {
  transaction_cost_bps = 5,
  false_discovery_rate = 0.10,
  minimum_source_families = 2,
  minimum_authoritative_origins = 5,
  minimum_holdout_origins = 3,
  development_fraction = 0.7,
} = {}) {
  const groups = new Map();
  for (const row of measurements || []) {
    if (!groups.has(row.signal_key)) groups.set(row.signal_key, []);
    groups.get(row.signal_key).push(row);
  }

  const evaluations = [...groups.entries()].map(([signalKey, rows]) => {
    rows.sort((a,b) => new Date(a.observed_at) - new Date(b.observed_at));
    const evaluation = evaluateRockiesEdgeCandidate(rows, {
      transaction_cost_bps,
      development_fraction,
    });
    const sourceFamilies = uniq(rows.map((row) => row.source_family));
    const observationIds = uniq(rows.map((row) => row.source_observation_id));
    const originEntities = uniq(rows.map((row) => row.origin_entity_ref));
    const authorityClasses = uniq(rows.map((row) => row.source_authority_class));
    const developmentP = approxTwoSidedNormalP(evaluation.development.t_like);

    const splitAt = Math.max(1, Math.floor(rows.length * development_fraction));
    const holdoutRows = rows.slice(splitAt);
    const holdoutOrigins = uniq(holdoutRows.map((row) => row.origin_entity_ref));
    const byOrigin = new Map();
    for (const row of holdoutRows) {
      if (!row.origin_entity_ref) continue;
      if (!byOrigin.has(row.origin_entity_ref)) byOrigin.set(row.origin_entity_ref, []);
      const excess = Number(row.forward_return || 0) - Number(row.benchmark_return || 0);
      const net = excess - Math.sign(excess || 1) * (transaction_cost_bps / 10000);
      byOrigin.get(row.origin_entity_ref).push(net);
    }
    const originMeans = [...byOrigin.values()].map((values) =>
      values.reduce((a,b) => a + b, 0) / values.length
    );
    const originBalancedHoldoutMean = originMeans.length
      ? originMeans.reduce((a,b) => a + b, 0) / originMeans.length
      : 0;
    const originBalancedSign = originBalancedHoldoutMean > 0
      ? 1
      : originBalancedHoldoutMean < 0 ? -1 : 0;
    const officialAuthority = authorityClasses.length > 0 &&
      authorityClasses.every((value) => String(value).startsWith("official_"));
    const authoritativeMultiOrigin =
      officialAuthority &&
      originEntities.length >= minimum_authoritative_origins &&
      holdoutOrigins.length >= minimum_holdout_origins &&
      originBalancedSign !== 0 &&
      originBalancedSign === evaluation.holdout.sign;

    return {
      schema: "evercraft.daytrade.edge-family-evaluation.v1",
      signal_key: signalKey,
      rockies_range: rows[0]?.rockies_range || null,
      observation_kind: rows[0]?.observation_kind || null,
      instrument: rows[0]?.instrument || null,
      benchmark: rows[0]?.benchmark || null,
      lag_key: rows[0]?.lag_key || null,
      observation_count: observationIds.length,
      distinct_source_families: sourceFamilies.length,
      source_families: sourceFamilies,
      distinct_origin_entities: originEntities.length,
      holdout_origin_entities: holdoutOrigins.length,
      origin_entities: originEntities,
      source_authority_classes: authorityClasses,
      origin_balanced_holdout_mean_excess_return_net: originBalancedHoldoutMean,
      development_p_approx: developmentP,
      development_q_bh: 1,
      base_evaluation: evaluation,
      candidate_checks: {
        ...evaluation.checks,
        minimum_source_family_diversity: sourceFamilies.length >= minimum_source_families,
        authoritative_multi_origin_diversity: authoritativeMultiOrigin,
        evidence_diversity_pass:
          sourceFamilies.length >= minimum_source_families || authoritativeMultiOrigin,
        false_discovery_rate_pass: false,
      },
      status: "NOT_VALIDATED",
      edge_claimed: false,
      live_trade_authority: false,
    };
  });

  benjaminiHochberg(evaluations);

  for (const row of evaluations) {
    row.candidate_checks.false_discovery_rate_pass =
      row.development_q_bh <= false_discovery_rate;

    const passed =
      row.base_evaluation.status === "RESEARCH_CANDIDATE" &&
      row.candidate_checks.evidence_diversity_pass === true &&
      row.candidate_checks.false_discovery_rate_pass === true;

    row.status = passed ? "RESEARCH_CANDIDATE" : "NOT_VALIDATED";
    row.learned_direction = passed
      ? row.base_evaluation.learned_direction
      : "UNRESOLVED";
  }

  evaluations.sort((a,b) =>
    Number(a.development_q_bh) - Number(b.development_q_bh) ||
    Math.abs(Number(b.base_evaluation?.holdout?.mean_excess_return_net || 0)) -
      Math.abs(Number(a.base_evaluation?.holdout?.mean_excess_return_net || 0))
  );

  return evaluations;
}

export async function fetchAlpacaBars(symbol, {
  start,
  end,
  key,
  secret,
  fetchImpl = fetch,
  max_pages = 10,
} = {}) {
  if (!key || !secret) throw new Error("edge_lab_alpaca_credentials_missing");

  const allBars = [];
  let pageToken = null;

  for (let page = 0; page < max_pages; page++) {
    const url = new URL(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars`);
    url.searchParams.set("timeframe", "5Min");
    url.searchParams.set("start", start);
    url.searchParams.set("end", end);
    url.searchParams.set("adjustment", "raw");
    url.searchParams.set("feed", "iex");
    url.searchParams.set("sort", "asc");
    url.searchParams.set("limit", "10000");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const response = await fetchImpl(url, {
      headers: {
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": secret,
        accept: "application/json",
      },
    });
    if (!response.ok) throw new Error(`edge_lab_alpaca_${symbol}_http_${response.status}`);

    const payload = await response.json();
    if (Array.isArray(payload?.bars)) allBars.push(...payload.bars);

    const next = String(payload?.next_page_token || "").trim();
    if (!next) return allBars;
    pageToken = next;
  }

  throw new Error(`edge_lab_alpaca_${symbol}_pagination_limit`);
}

function parseObservationFile(file) {
  const raw = fs.readFileSync(file, "utf8").trim();
  if (!raw) return [];
  if (raw.startsWith("[")) return JSON.parse(raw);
  if (raw.startsWith("{")) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.observations)) return parsed.observations;
    if (parsed.observations && typeof parsed.observations === "object") {
      return Object.values(parsed.observations);
    }
    return [parsed];
  }
  return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function dateWindow(observations) {
  const times = observations
    .map((row) => new Date(row.observed_at).getTime())
    .filter(Number.isFinite);
  if (!times.length) throw new Error("edge_lab_observation_timestamps_missing");
  const min = new Date(Math.min(...times));
  const max = new Date(Math.max(...times));
  min.setUTCDate(min.getUTCDate() - 1);
  max.setUTCDate(max.getUTCDate() + 14);
  return { start: min.toISOString(), end: max.toISOString() };
}

export async function runEdgeResearchBatch({
  observations,
  key = process.env.ALPACA_TRADING || process.env.ALPACA_API_KEY_ID || "",
  secret = process.env.ALPACA_TRADING_SECRET || process.env.ALPACA_API_SECRET_KEY || "",
  fetchImpl = fetch,
  transaction_cost_bps = 5,
} = {}) {
  const hypotheses = (observations || []).flatMap((observation) =>
    rockiesObservationToEdgeHypotheses(observation, {
      independent_source_family_count:
        Number(observation?.metadata?.independent_source_family_count || 1),
    })
  );

  if (!hypotheses.length) {
    return {
      schema: "evercraft.daytrade.edge-research-batch.v1",
      batch_id: "edgebatch:" + sha({ empty: true, at: new Date().toISOString() }).slice(0,24),
      status: "NO_TESTABLE_HYPOTHESES",
      hypothesis_count: 0,
      measurement_count: 0,
      family_count: 0,
      candidates: [],
      live_trade_authority: false,
    };
  }

  const window = dateWindow(hypotheses);
  const symbols = uniq([
    "SPY",
    ...hypotheses.flatMap((row) => row.research_instruments || []),
  ]);

  const barsBySymbol = {};
  for (const symbol of symbols) {
    barsBySymbol[symbol] = await fetchAlpacaBars(symbol, {
      ...window,
      key,
      secret,
      fetchImpl,
    });
  }

  const measurements = measureRockiesHypotheses(hypotheses, barsBySymbol);
  const evaluations = evaluateEdgeFamilies(measurements, { transaction_cost_bps });
  const candidates = evaluations.filter((row) => row.status === "RESEARCH_CANDIDATE");

  const body = {
    schema: "evercraft.daytrade.edge-research-batch.v1",
    generated_at: new Date().toISOString(),
    observation_count: observations.length,
    hypothesis_count: hypotheses.length,
    measurement_count: measurements.length,
    family_count: evaluations.length,
    research_candidate_count: candidates.length,
    date_window: window,
    transaction_cost_bps,
    no_lookahead_policy: true,
    multiple_testing_control: "benjamini_hochberg_development_screen",
    candidates,
    evaluations,
    live_trade_authority: false,
  };

  return {
    ...body,
    batch_id: "edgebatch:" + sha(body).slice(0,24),
  };
}

export function persistEdgeResearchBatch(report, {
  stateDir = process.env.EVERCRAFT_EDGE_LAB_STATE_DIR || ".evercraft/edge-lab",
} = {}) {
  const root = path.resolve(stateDir);
  const batchDir = path.join(root, "batches");
  fs.mkdirSync(batchDir, { recursive: true, mode: 0o700 });

  const batchFile = path.join(batchDir, report.batch_id.replace(":", "_") + ".json");
  fs.writeFileSync(batchFile, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });

  const ledger = path.join(root, "candidate-evaluations.jsonl");
  for (const row of report.evaluations || []) {
    const receipt = {
      ...row,
      batch_id: report.batch_id,
      recorded_at: report.generated_at,
      receipt_hash: "sha256:" + sha({
        signal_key: row.signal_key,
        batch_id: report.batch_id,
        status: row.status,
        development_q_bh: row.development_q_bh,
        base_evaluation: row.base_evaluation,
      }),
    };
    fs.appendFileSync(ledger, JSON.stringify(receipt) + "\n", { mode: 0o600 });
  }

  return {
    schema: "evercraft.daytrade.edge-research-persistence-receipt.v1",
    batch_id: report.batch_id,
    batch_file: batchFile,
    ledger_file: ledger,
    candidate_count: report.research_candidate_count || 0,
    live_trade_authority: false,
  };
}

async function main() {
  const file = process.env.ROCKIES_OBSERVATIONS_PATH;
  if (!file) throw new Error("ROCKIES_OBSERVATIONS_PATH_required");
  const observations = parseObservationFile(file);
  const report = await runEdgeResearchBatch({ observations });
  const receipt = persistEdgeResearchBatch(report);
  console.log(JSON.stringify({
    ok: true,
    schema: report.schema,
    batch_id: report.batch_id,
    observations: report.observation_count || 0,
    hypotheses: report.hypothesis_count,
    measurements: report.measurement_count,
    families: report.family_count,
    candidates: report.research_candidate_count || 0,
    multiple_testing_control: report.multiple_testing_control || null,
    live_trade_authority: false,
    persistence_receipt: receipt,
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error("Edge research batch failed:", error?.message || String(error));
    process.exitCode = 1;
  });
}
