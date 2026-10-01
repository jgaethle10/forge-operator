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

export const EXECUTION_DELAY_STRESS_BARS = Object.freeze({
  "5m": 1,
  "15m": 3,
  "30m": 6,
  "60m": 12,
  "90m": 18,
});

export const ALTERNATE_BENCHMARKS_BY_INSTRUMENT = Object.freeze({
  SOXX: Object.freeze(["QQQ", "SMH"]),
  SMH: Object.freeze(["QQQ", "SOXX"]),
  QQQ: Object.freeze(["XLK"]),
});

function alternateBenchmarksFor(instrument) {
  const configured = ALTERNATE_BENCHMARKS_BY_INSTRUMENT[instrument];
  const values = configured || ["QQQ"];
  return [...new Set(values)].filter((symbol) => symbol && symbol !== instrument);
}

function sha(value) {
  return crypto.createHash("sha256").update(
    typeof value === "string" ? value : JSON.stringify(value)
  ).digest("hex");
}

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}

const NY_MARKET_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function normalizeBars(rows = []) {
  return rows
    .map((row) => ({
      t: row?.t || row?.timestamp,
      c: Number(row?.c ?? row?.close),
    }))
    .filter((row) => row.t && Number.isFinite(row.c) && row.c > 0)
    .sort((a,b) => new Date(a.t) - new Date(b.t));
}

export function filterCoreSessionBars(rows = []) {
  return normalizeBars(rows).filter((row) => {
    const parts = Object.fromEntries(
      NY_MARKET_CLOCK.formatToParts(new Date(row.t)).map((part) => [part.type, part.value])
    );
    if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
    const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
    return minuteOfDay >= 570 && minuteOfDay < 960;
  });
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

function marketDateKey(timestamp) {
  const parts = Object.fromEntries(
    NY_MARKET_CLOCK.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function measuredReturnFromIndex(bars, startIndex, lagBars, observedAt) {
  if (startIndex < 0) return null;
  const endIndex = startIndex + lagBars;
  if (startIndex >= bars.length || endIndex >= bars.length) return null;
  const start = bars[startIndex];
  const end = bars[endIndex];
  const pathBars = bars.slice(startIndex, endIndex + 1);
  const pathReturns = [];
  for (let i = 1; i < pathBars.length; i++) {
    const previous = Number(pathBars[i - 1].c);
    const current = Number(pathBars[i].c);
    if (previous > 0 && current > 0) pathReturns.push(Math.log(current / previous));
  }
  const pathMean = pathReturns.length
    ? pathReturns.reduce((a,b) => a + b, 0) / pathReturns.length
    : 0;
  const realizedVariance = pathReturns.length > 1
    ? pathReturns.reduce((sum, value) => sum + (value - pathMean) ** 2, 0) /
      (pathReturns.length - 1)
    : 0;
  const pathRelative = pathBars.map((bar) => Number(bar.c) / Number(start.c) - 1);
  const startDate = marketDateKey(start.t);
  const sessionStartIndex = bars.findIndex((bar) => marketDateKey(bar.t) === startDate);
  let previousSessionClose = null;
  if (sessionStartIndex > 0) {
    const previousDate = marketDateKey(bars[sessionStartIndex - 1].t);
    for (let i = sessionStartIndex - 1; i >= 0; i--) {
      if (marketDateKey(bars[i].t) !== previousDate) break;
      previousSessionClose = Number(bars[i].c);
      if (i === 0 || marketDateKey(bars[i - 1].t) !== previousDate) break;
    }
  }
  const sessionOpenPrice = sessionStartIndex >= 0 ? Number(bars[sessionStartIndex].c) : null;
  const openingGap = previousSessionClose && sessionOpenPrice
    ? sessionOpenPrice / previousSessionClose - 1
    : null;
  return {
    start_time: start.t,
    end_time: end.t,
    start_price: start.c,
    end_price: end.c,
    forward_return: end.c / start.c - 1,
    realized_volatility_5m: Math.sqrt(Math.max(0, realizedVariance)),
    max_path_gain: pathRelative.length ? Math.max(...pathRelative) : 0,
    max_path_drawdown: pathRelative.length ? Math.min(...pathRelative) : 0,
    opening_gap_return: openingGap,
    no_pre_observation_price_used: new Date(start.t) >= new Date(observedAt),
  };
}

function measuredReturnAtNextSessionOpen(bars, observedAt, lagBars) {
  const observedDate = marketDateKey(observedAt);
  const startIndex = bars.findIndex((bar) => marketDateKey(bar.t) > observedDate);
  return measuredReturnFromIndex(bars, startIndex, lagBars, observedAt);
}

function measuredReturn(bars, observedAt, lagBars, entryDelayBars = 0) {
  const firstIndex = firstBarAtOrAfter(bars, observedAt);
  if (firstIndex < 0) return null;
  const delay = Math.max(0, Number(entryDelayBars || 0));
  const startIndex = firstIndex + delay;
  const endIndex = startIndex + lagBars;
  if (startIndex >= bars.length || endIndex >= bars.length) return null;
  return measuredReturnFromIndex(bars, startIndex, lagBars, observedAt);
}

export function buildMatchedPlaceboHypotheses(hypotheses = [], {
  offsets_days = [-7, 7],
  exclusion_hours = 24,
} = {}) {
  const byOrigin = new Map();
  for (const hypothesis of hypotheses) {
    const origin = hypothesis.origin_entity_ref || "unknown";
    if (!byOrigin.has(origin)) byOrigin.set(origin, []);
    const time = new Date(hypothesis.observed_at).getTime();
    if (Number.isFinite(time)) byOrigin.get(origin).push(time);
  }

  const exclusionMs = Number(exclusion_hours) * 60 * 60 * 1000;
  const out = [];
  for (const hypothesis of hypotheses) {
    const base = new Date(hypothesis.observed_at).getTime();
    if (!Number.isFinite(base)) continue;
    const origin = hypothesis.origin_entity_ref || "unknown";
    const realTimes = byOrigin.get(origin) || [];

    for (const offsetDays of offsets_days) {
      const shifted = base + Number(offsetDays) * 86400000;
      if (
        realTimes.some((real) =>
          real !== base && Math.abs(real - shifted) <= exclusionMs
        )
      ) continue;

      out.push({
        ...hypothesis,
        hypothesis_id: "edgeplacebo:" + sha({
          hypothesis_id: hypothesis.hypothesis_id,
          offset_days: Number(offsetDays),
        }).slice(0,24),
        source_observation_id: "placebo:" + sha({
          source_observation_id: hypothesis.source_observation_id,
          offset_days: Number(offsetDays),
        }).slice(0,24),
        observed_at: new Date(shifted).toISOString(),
        placebo_for_source_observation_id: hypothesis.source_observation_id,
        placebo_offset_days: Number(offsetDays),
        research_only: true,
        live_trade_authority: false,
      });
    }
  }
  return out;
}

export function buildDeterministicRandomPlaceboHypotheses(hypotheses = [], {
  offset_pool_days = [-35, -28, -21, -14, 14, 21, 28, 35],
  per_observation = 2,
  exclusion_hours = 24,
} = {}) {
  const byOrigin = new Map();
  for (const hypothesis of hypotheses) {
    const origin = hypothesis.origin_entity_ref || "unknown";
    if (!byOrigin.has(origin)) byOrigin.set(origin, []);
    const time = new Date(hypothesis.observed_at).getTime();
    if (Number.isFinite(time)) byOrigin.get(origin).push(time);
  }

  const exclusionMs = Number(exclusion_hours) * 60 * 60 * 1000;
  const out = [];
  for (const hypothesis of hypotheses) {
    const base = new Date(hypothesis.observed_at).getTime();
    if (!Number.isFinite(base)) continue;
    const origin = hypothesis.origin_entity_ref || "unknown";
    const realTimes = byOrigin.get(origin) || [];
    const rankedOffsets = [...offset_pool_days]
      .map((offsetDays) => ({
        offsetDays: Number(offsetDays),
        rank: sha({
          hypothesis_id: hypothesis.hypothesis_id,
          source_observation_id: hypothesis.source_observation_id,
          offset_days: Number(offsetDays),
          scheme: "deterministic_random_calendar",
        }),
      }))
      .sort((a,b) => a.rank.localeCompare(b.rank));

    let selected = 0;
    for (const { offsetDays } of rankedOffsets) {
      if (selected >= Number(per_observation)) break;
      const shifted = base + offsetDays * 86400000;
      if (
        realTimes.some((real) =>
          real !== base && Math.abs(real - shifted) <= exclusionMs
        )
      ) continue;

      out.push({
        ...hypothesis,
        hypothesis_id: "edgerandomplacebo:" + sha({
          hypothesis_id: hypothesis.hypothesis_id,
          offset_days: offsetDays,
        }).slice(0,24),
        source_observation_id: "random-placebo:" + sha({
          source_observation_id: hypothesis.source_observation_id,
          offset_days: offsetDays,
        }).slice(0,24),
        observed_at: new Date(shifted).toISOString(),
        placebo_for_source_observation_id: hypothesis.source_observation_id,
        placebo_offset_days: offsetDays,
        placebo_scheme: "deterministic_random_calendar",
        research_only: true,
        live_trade_authority: false,
      });
      selected += 1;
    }
  }
  return out;
}

export function measureRockiesHypotheses(hypotheses, barsBySymbol, {
  benchmark = "SPY",
  lagBars = FIVE_MINUTE_LAG_BARS,
} = {}) {
  const benchmarkBars = filterCoreSessionBars(barsBySymbol?.[benchmark] || []);
  const rows = [];

  for (const hypothesis of hypotheses || []) {
    for (const instrument of hypothesis.research_instruments || []) {
      const instrumentBars = filterCoreSessionBars(barsBySymbol?.[instrument] || []);
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

        const alternateBenchmarks = {};
        for (const alternateBenchmark of alternateBenchmarksFor(instrument)) {
          const alternateBars = filterCoreSessionBars(
            barsBySymbol?.[alternateBenchmark] || []
          );
          if (!alternateBars.length) continue;
          const alternateMove = measuredReturn(
            alternateBars,
            hypothesis.observed_at,
            bars
          );
          if (!alternateMove || !alternateMove.no_pre_observation_price_used) continue;
          alternateBenchmarks[alternateBenchmark] = {
            benchmark_return: alternateMove.forward_return,
            benchmark_start_time: alternateMove.start_time,
            benchmark_end_time: alternateMove.end_time,
            excess_return: instrumentMove.forward_return - alternateMove.forward_return,
          };
        }

        const executionDelayStress = {};
        for (const [delayKey, delayBars] of Object.entries(EXECUTION_DELAY_STRESS_BARS)) {
          const delayedInstrument = measuredReturn(
            instrumentBars,
            hypothesis.observed_at,
            bars,
            delayBars
          );
          const delayedBenchmark = measuredReturn(
            benchmarkBars,
            hypothesis.observed_at,
            bars,
            delayBars
          );
          if (!delayedInstrument || !delayedBenchmark) continue;
          if (
            !delayedInstrument.no_pre_observation_price_used ||
            !delayedBenchmark.no_pre_observation_price_used
          ) {
            throw new Error("edge_lab_timing_stress_lookahead_violation");
          }
          executionDelayStress[delayKey] = {
            delay_bars: delayBars,
            delay_minutes: delayBars * 5,
            forward_return: delayedInstrument.forward_return,
            benchmark_return: delayedBenchmark.forward_return,
            excess_return: delayedInstrument.forward_return - delayedBenchmark.forward_return,
            instrument_start_time: delayedInstrument.start_time,
            instrument_end_time: delayedInstrument.end_time,
            benchmark_start_time: delayedBenchmark.start_time,
            benchmark_end_time: delayedBenchmark.end_time,
          };
        }

        const nextSessionInstrument = measuredReturnAtNextSessionOpen(
          instrumentBars,
          hypothesis.observed_at,
          bars
        );
        const nextSessionBenchmark = measuredReturnAtNextSessionOpen(
          benchmarkBars,
          hypothesis.observed_at,
          bars
        );
        if (nextSessionInstrument && nextSessionBenchmark) {
          if (
            !nextSessionInstrument.no_pre_observation_price_used ||
            !nextSessionBenchmark.no_pre_observation_price_used
          ) {
            throw new Error("edge_lab_next_session_lookahead_violation");
          }
          executionDelayStress.next_session_open = {
            entry_policy: "next_core_session_open",
            forward_return: nextSessionInstrument.forward_return,
            benchmark_return: nextSessionBenchmark.forward_return,
            excess_return: nextSessionInstrument.forward_return - nextSessionBenchmark.forward_return,
            instrument_start_time: nextSessionInstrument.start_time,
            instrument_end_time: nextSessionInstrument.end_time,
            benchmark_start_time: nextSessionBenchmark.start_time,
            benchmark_end_time: nextSessionBenchmark.end_time,
          };
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
          placebo_for_source_observation_id: hypothesis.placebo_for_source_observation_id || null,
          placebo_offset_days: Number.isFinite(Number(hypothesis.placebo_offset_days))
            ? Number(hypothesis.placebo_offset_days)
            : null,
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
          instrument_realized_volatility_5m: instrumentMove.realized_volatility_5m,
          benchmark_realized_volatility_5m: benchmarkMove.realized_volatility_5m,
          instrument_max_path_gain: instrumentMove.max_path_gain,
          instrument_max_path_drawdown: instrumentMove.max_path_drawdown,
          benchmark_max_path_gain: benchmarkMove.max_path_gain,
          benchmark_max_path_drawdown: benchmarkMove.max_path_drawdown,
          instrument_opening_gap_return: instrumentMove.opening_gap_return,
          benchmark_opening_gap_return: benchmarkMove.opening_gap_return,
          instrument_start_time: instrumentMove.start_time,
          instrument_end_time: instrumentMove.end_time,
          benchmark_start_time: benchmarkMove.start_time,
          benchmark_end_time: benchmarkMove.end_time,
          alternate_benchmarks: alternateBenchmarks,
          execution_delay_stress: executionDelayStress,
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
    const byOriginRawNet = new Map();
    const byOriginStrategyNet = new Map();
    const expectedSign = evaluation.learned_direction === "NEGATIVE_EXCESS_RETURN"
      ? -1
      : evaluation.learned_direction === "POSITIVE_EXCESS_RETURN"
        ? 1
        : Number(evaluation.holdout?.expected_sign || 0);
    const cost = transaction_cost_bps / 10000;

    for (const row of holdoutRows) {
      if (!row.origin_entity_ref) continue;
      if (!byOriginRawNet.has(row.origin_entity_ref)) {
        byOriginRawNet.set(row.origin_entity_ref, []);
        byOriginStrategyNet.set(row.origin_entity_ref, []);
      }
      const excess = Number(row.forward_return || 0) - Number(row.benchmark_return || 0);
      const rawDirectionalNet = expectedSign === 0
        ? excess
        : excess - expectedSign * cost;
      const strategyNet = expectedSign === 0
        ? 0
        : expectedSign * excess - cost;
      byOriginRawNet.get(row.origin_entity_ref).push(rawDirectionalNet);
      byOriginStrategyNet.get(row.origin_entity_ref).push(strategyNet);
    }
    const originRawMeans = [...byOriginRawNet.values()].map((values) =>
      values.reduce((a,b) => a + b, 0) / values.length
    );
    const originStrategyMeans = [...byOriginStrategyNet.values()].map((values) =>
      values.reduce((a,b) => a + b, 0) / values.length
    );
    const originBalancedHoldoutMean = originRawMeans.length
      ? originRawMeans.reduce((a,b) => a + b, 0) / originRawMeans.length
      : 0;
    const originBalancedStrategyMean = originStrategyMeans.length
      ? originStrategyMeans.reduce((a,b) => a + b, 0) / originStrategyMeans.length
      : 0;
    const officialAuthority = authorityClasses.length > 0 &&
      authorityClasses.every((value) => String(value).startsWith("official_"));
    const authoritativeMultiOrigin =
      officialAuthority &&
      originEntities.length >= minimum_authoritative_origins &&
      holdoutOrigins.length >= minimum_holdout_origins &&
      expectedSign !== 0 &&
      originBalancedStrategyMean > 0;

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
      origin_balanced_holdout_mean_strategy_return_net: originBalancedStrategyMean,
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
  max_pages = 100,
} = {}) {
  if (!key || !secret) throw new Error("edge_lab_alpaca_credentials_missing");

  const allBars = [];
  let pageToken = null;
  const seenPageTokens = new Set();

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
    if (seenPageTokens.has(next)) {
      throw new Error(`edge_lab_alpaca_${symbol}_pagination_loop`);
    }
    seenPageTokens.add(next);
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

  const placeboHypotheses = buildMatchedPlaceboHypotheses(hypotheses);
  const randomPlaceboHypotheses = buildDeterministicRandomPlaceboHypotheses(hypotheses);
  const window = dateWindow([
    ...hypotheses,
    ...placeboHypotheses,
    ...randomPlaceboHypotheses,
  ]);
  const researchInstruments = uniq([
    ...hypotheses.flatMap((row) => row.research_instruments || []),
    ...placeboHypotheses.flatMap((row) => row.research_instruments || []),
    ...randomPlaceboHypotheses.flatMap((row) => row.research_instruments || []),
  ]);
  const symbols = uniq([
    "SPY",
    ...researchInstruments,
    ...researchInstruments.flatMap((instrument) => alternateBenchmarksFor(instrument)),
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
  const placeboMeasurements = measureRockiesHypotheses(placeboHypotheses, barsBySymbol);
  const randomPlaceboMeasurements = measureRockiesHypotheses(
    randomPlaceboHypotheses,
    barsBySymbol
  );
  const evaluations = evaluateEdgeFamilies(measurements, { transaction_cost_bps });
  const candidates = evaluations.filter((row) => row.status === "RESEARCH_CANDIDATE");

  const body = {
    schema: "evercraft.daytrade.edge-research-batch.v1",
    generated_at: new Date().toISOString(),
    observation_count: observations.length,
    hypothesis_count: hypotheses.length,
    measurement_count: measurements.length,
    placebo_hypothesis_count: placeboHypotheses.length,
    placebo_measurement_count: placeboMeasurements.length,
    random_placebo_hypothesis_count: randomPlaceboHypotheses.length,
    random_placebo_measurement_count: randomPlaceboMeasurements.length,
    family_count: evaluations.length,
    research_candidate_count: candidates.length,
    measurements,
    placebo_measurements: placeboMeasurements,
    random_placebo_measurements: randomPlaceboMeasurements,
    placebo_policy: {
      offsets_days: [-7, 7],
      exclusion_hours_from_other_same_origin_events: 24,
      same_weekday_preserved: true,
      historical_diagnostic_only: true,
    },
    random_placebo_policy: {
      offset_pool_days: [-35, -28, -21, -14, 14, 21, 28, 35],
      deterministic_selection_per_observation: 2,
      exclusion_hours_from_other_same_origin_events: 24,
      same_weekday_preserved: true,
      historical_diagnostic_only: true,
    },
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
