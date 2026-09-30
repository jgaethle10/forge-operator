import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_UNIVERSE = ["SPY","QQQ","AAPL","NVDA","MSFT","AMZN","META","GOOGL","TSLA","AMD"];

export const DEFAULT_RISK = Object.freeze({
  account_size: 20,
  max_risk_per_trade: 0.10,
  max_daily_loss: 0.20,
  max_trades_per_day: 2,
  min_reward_risk: 1.5,
  one_open_position: true,
  entry_slippage_bps: 2,
  exit_slippage_bps: 2,
});

const NY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function nyParts(timestamp) {
  const parts = Object.fromEntries(NY.formatToParts(new Date(timestamp)).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minuteOfDay: hour * 60 + minute,
  };
}

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : null;
}

function normalizeBar(raw) {
  const t = raw?.t ?? raw?.timestamp;
  const o = n(raw?.o ?? raw?.open);
  const h = n(raw?.h ?? raw?.high);
  const l = n(raw?.l ?? raw?.low);
  const c = n(raw?.c ?? raw?.close);
  const v = n(raw?.v ?? raw?.volume) ?? 0;
  if (!t || [o,h,l,c].some((x) => x === null)) return null;
  return { t, o, h, l, c, v };
}

export function riskGate({
  data_source = "ALPACA_IEX",
  source_age_seconds = 0,
  stale_after_seconds = 15,
  reward_risk_ratio,
  planned_risk_dollars,
  trades_today,
  open_position,
}, risk = DEFAULT_RISK) {
  if (!data_source || data_source === "MOCK") return { pass: false, reason: "unverified_data_source" };
  if (!Number.isFinite(source_age_seconds) || source_age_seconds > stale_after_seconds) return { pass: false, reason: "stale_market_data" };
  if (!Number.isFinite(reward_risk_ratio) || reward_risk_ratio < risk.min_reward_risk) return { pass: false, reason: "reward_risk_below_floor" };
  if (!Number.isFinite(planned_risk_dollars) || planned_risk_dollars <= 0 || planned_risk_dollars > risk.max_risk_per_trade + 1e-9) return { pass: false, reason: "risk_per_trade_exceeded" };
  if (trades_today >= risk.max_trades_per_day) return { pass: false, reason: "daily_trade_limit_reached" };
  if (risk.one_open_position && open_position) return { pass: false, reason: "one_position_rule" };
  return { pass: true, reason: "pass" };
}

export function runAdversarialDrills(risk = DEFAULT_RISK) {
  const valid = {
    data_source: "ALPACA_IEX",
    source_age_seconds: 1,
    stale_after_seconds: 15,
    reward_risk_ratio: 1.5,
    planned_risk_dollars: risk.max_risk_per_trade,
    trades_today: 0,
    open_position: false,
  };
  const drills = [
    ["mock-data-block", { ...valid, data_source: "MOCK" }, false],
    ["stale-data-block", { ...valid, source_age_seconds: 99 }, false],
    ["bad-rr-block", { ...valid, reward_risk_ratio: 1.49 }, false],
    ["risk-overrun-block", { ...valid, planned_risk_dollars: risk.max_risk_per_trade + 0.01 }, false],
    ["trade-limit-block", { ...valid, trades_today: risk.max_trades_per_day }, false],
    ["overlap-block", { ...valid, open_position: true }, false],
    ["clean-paper-pass", valid, true],
  ];
  return drills.map(([name, input, expected]) => {
    const result = riskGate(input, risk);
    return { name, expected_pass: expected, actual_pass: result.pass, reason: result.reason, passed: result.pass === expected };
  });
}

export function buildReplayCandidates(symbol, bars, risk = DEFAULT_RISK) {
  const market = bars
    .map(normalizeBar)
    .filter(Boolean)
    .map((bar) => ({ ...bar, ny: nyParts(bar.t) }))
    .filter((bar) => bar.ny.minuteOfDay >= 570 && bar.ny.minuteOfDay <= 960);

  const byDate = new Map();
  for (const bar of market) {
    if (!byDate.has(bar.ny.date)) byDate.set(bar.ny.date, []);
    byDate.get(bar.ny.date).push(bar);
  }

  const candidates = [];
  for (const [date, rows] of byDate) {
    rows.sort((a,b) => new Date(a.t) - new Date(b.t));
    if (rows.length < 12) continue;
    const opening = rows.slice(0, 6);
    const openingHigh = Math.max(...opening.map((x) => x.h));
    const openingLow = Math.min(...opening.map((x) => x.l));
    const openingRange = openingHigh - openingLow;
    if (!(openingRange > 0)) continue;

    const signalIndex = rows.findIndex((bar, i) =>
      i >= 6 &&
      bar.c > openingHigh &&
      (bar.c - openingHigh) / openingRange <= 0.8
    );
    if (signalIndex < 0) continue;

    const signal = rows[signalIndex];
    const rawEntry = signal.c;
    const entry = rawEntry * (1 + risk.entry_slippage_bps / 10000);
    const stop = openingHigh - 0.25 * openingRange;
    const perShareRisk = entry - stop;
    if (!(perShareRisk > 0)) continue;

    const target = entry + risk.min_reward_risk * perShareRisk;
    const riskQty = risk.max_risk_per_trade / perShareRisk;
    const cashQty = risk.account_size / entry;
    const quantity = Math.max(0, Math.min(riskQty, cashQty));
    if (!(quantity > 0)) continue;

    const plannedRisk = quantity * perShareRisk;
    const gate = riskGate({
      reward_risk_ratio: risk.min_reward_risk,
      planned_risk_dollars: plannedRisk,
      trades_today: 0,
      open_position: false,
      data_source: "ALPACA_IEX",
      source_age_seconds: 0,
      stale_after_seconds: 15,
    }, risk);
    if (!gate.pass) continue;

    let exitPrice = rows.at(-1).c * (1 - risk.exit_slippage_bps / 10000);
    let exitTime = rows.at(-1).t;
    let exitReason = "end_of_day";
    for (const bar of rows.slice(signalIndex + 1)) {
      const hitStop = bar.l <= stop;
      const hitTarget = bar.h >= target;
      if (hitStop && hitTarget) {
        exitPrice = stop * (1 - risk.exit_slippage_bps / 10000);
        exitTime = bar.t;
        exitReason = "ambiguous_bar_conservative_stop";
        break;
      }
      if (hitStop) {
        exitPrice = stop * (1 - risk.exit_slippage_bps / 10000);
        exitTime = bar.t;
        exitReason = "stop";
        break;
      }
      if (hitTarget) {
        exitPrice = target * (1 - risk.exit_slippage_bps / 10000);
        exitTime = bar.t;
        exitReason = "target";
        break;
      }
    }

    const pnl = (exitPrice - entry) * quantity;
    candidates.push({
      date,
      symbol,
      signal_time: signal.t,
      exit_time: exitTime,
      entry,
      stop,
      target,
      quantity,
      planned_risk_dollars: plannedRisk,
      reward_risk_ratio: risk.min_reward_risk,
      simulated_pnl: pnl,
      exit_reason: exitReason,
      breakout_strength: (signal.c - openingHigh) / openingRange,
      data_source: "ALPACA_IEX_HISTORICAL_5MIN",
      execution: "SIMULATION_ONLY",
    });
  }
  return candidates;
}

export function selectDailyPracticeTrades(candidates, risk = DEFAULT_RISK) {
  const byDate = new Map();
  for (const c of candidates) {
    if (!byDate.has(c.date)) byDate.set(c.date, []);
    byDate.get(c.date).push(c);
  }

  const sessions = [];
  for (const [date, rows] of [...byDate.entries()].sort(([a],[b]) => a.localeCompare(b))) {
    rows.sort((a,b) => {
      const dt = new Date(a.signal_time) - new Date(b.signal_time);
      return dt || b.breakout_strength - a.breakout_strength;
    });

    const taken = [];
    const skipped = [];
    let realized = 0;
    let openUntil = null;

    for (const candidate of rows) {
      if (taken.length >= risk.max_trades_per_day) {
        skipped.push({ symbol: candidate.symbol, reason: "daily_trade_limit_reached" });
        continue;
      }
      if (realized <= -risk.max_daily_loss + 1e-9) {
        skipped.push({ symbol: candidate.symbol, reason: "daily_kill_switch" });
        continue;
      }
      if (openUntil && new Date(candidate.signal_time) < openUntil) {
        skipped.push({ symbol: candidate.symbol, reason: "one_position_rule" });
        continue;
      }

      const gate = riskGate({
        reward_risk_ratio: candidate.reward_risk_ratio,
        planned_risk_dollars: candidate.planned_risk_dollars,
        trades_today: taken.length,
        open_position: false,
        data_source: "ALPACA_IEX",
        source_age_seconds: 0,
        stale_after_seconds: 15,
      }, risk);
      if (!gate.pass) {
        skipped.push({ symbol: candidate.symbol, reason: gate.reason });
        continue;
      }

      taken.push(candidate);
      realized += candidate.simulated_pnl;
      openUntil = new Date(candidate.exit_time);
    }

    const hardViolations = taken.filter((t) =>
      t.planned_risk_dollars > risk.max_risk_per_trade + 1e-9 ||
      t.reward_risk_ratio < risk.min_reward_risk - 1e-9 ||
      t.execution !== "SIMULATION_ONLY"
    ).length;

    const disciplineScore = Math.max(0, 100 - hardViolations * 50);
    sessions.push({
      date,
      trades: taken,
      skipped,
      trade_count: taken.length,
      simulated_pnl: realized,
      hard_violations: hardViolations,
      discipline_score: disciplineScore,
    });
  }
  return sessions;
}

async function fetchBars(symbol, start, end, key, secret) {
  const url = new URL(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars`);
  url.searchParams.set("timeframe", "5Min");
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);
  url.searchParams.set("adjustment", "raw");
  url.searchParams.set("feed", "iex");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", "10000");

  const response = await fetch(url, {
    headers: {
      "APCA-API-KEY-ID": key,
      "APCA-API-SECRET-KEY": secret,
      accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`alpaca_market_data_${symbol}_http_${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload?.bars) ? payload.bars : [];
}

function completedWindow(now = new Date()) {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 1);
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 45);
  start.setUTCHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function summaryMarkdown(report) {
  const lines = [
    "# DayTrade Lens Practice Camp",
    "",
    `Run: ${report.generated_at}`,
    `Mode: **SIMULATION ONLY**`,
    `Historical fixtures only. These symbols are test instruments, not live trade recommendations.`,
    "",
    `- Replay sessions: **${report.summary.sessions}**`,
    `- Simulated trades: **${report.summary.trades}**`,
    `- Hard rule violations: **${report.summary.hard_violations}**`,
    `- Adversarial drills passed: **${report.summary.drills_passed}/${report.summary.drills_total}**`,
    `- Average discipline score: **${report.summary.average_discipline_score.toFixed(1)}**`,
    `- Promotion gate: **${report.promotion_gate.state}**`,
    "",
    "Promotion requires at least 20 replay sessions, zero hard-rule violations, 100% adversarial drill pass rate, and average discipline >=95. Promotion never enables live trading automatically.",
  ];
  return lines.join("\n") + "\n";
}

export async function runPracticeCamp({
  key = process.env.ALPACA_TRADING || process.env.ALPACA_API_KEY_ID || "",
  secret = process.env.ALPACA_TRADING_SECRET || process.env.ALPACA_API_SECRET_KEY || "",
  universe = DEFAULT_UNIVERSE,
  risk = DEFAULT_RISK,
  now = new Date(),
} = {}) {
  if (!key || !secret) throw new Error("alpaca_market_data_credentials_missing");
  const window = completedWindow(now);
  const allCandidates = [];
  const sourceStats = [];

  for (const symbol of universe) {
    const bars = await fetchBars(symbol, window.start, window.end, key, secret);
    sourceStats.push({ symbol, bars: bars.length });
    allCandidates.push(...buildReplayCandidates(symbol, bars, risk));
  }

  const sessions = selectDailyPracticeTrades(allCandidates, risk);
  const drills = runAdversarialDrills(risk);
  const hardViolations = sessions.reduce((sum, s) => sum + s.hard_violations, 0);
  const trades = sessions.reduce((sum, s) => sum + s.trade_count, 0);
  const avgDiscipline = sessions.length
    ? sessions.reduce((sum, s) => sum + s.discipline_score, 0) / sessions.length
    : 0;
  const drillsPassed = drills.filter((d) => d.passed).length;

  const eligible =
    sessions.length >= 20 &&
    hardViolations === 0 &&
    drillsPassed === drills.length &&
    avgDiscipline >= 95;

  return {
    schema: "evercraft.daytrade-practice-camp.v1",
    generated_at: new Date().toISOString(),
    mode: "SIMULATION_ONLY",
    live_order_capability_used: false,
    historical_window: window,
    practice_universe: universe,
    fixtures_are_trade_recommendations: false,
    risk_kernel: risk,
    source_stats: sourceStats,
    adversarial_drills: drills,
    sessions,
    summary: {
      sessions: sessions.length,
      trades,
      hard_violations: hardViolations,
      drills_passed: drillsPassed,
      drills_total: drills.length,
      average_discipline_score: avgDiscipline,
      simulated_pnl_total: sessions.reduce((sum, s) => sum + s.simulated_pnl, 0),
    },
    promotion_gate: {
      state: eligible ? "REVIEW_ELIGIBLE" : "TRAINING",
      automatic_live_enablement: false,
      requirements: {
        minimum_replay_sessions: 20,
        hard_rule_violations: 0,
        adversarial_drill_pass_rate: 1,
        minimum_average_discipline_score: 95,
      },
    },
  };
}

async function main() {
  const report = await runPracticeCamp();
  const out = process.env.PRACTICE_REPORT_PATH || "artifacts/daytrade-practice/latest.json";
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");

  console.log(JSON.stringify({
    ok: true,
    schema: report.schema,
    mode: report.mode,
    sessions: report.summary.sessions,
    trades: report.summary.trades,
    hard_violations: report.summary.hard_violations,
    drills: `${report.summary.drills_passed}/${report.summary.drills_total}`,
    average_discipline_score: Number(report.summary.average_discipline_score.toFixed(1)),
    simulated_pnl_total: Number(report.summary.simulated_pnl_total.toFixed(4)),
    promotion_gate: report.promotion_gate.state,
    live_order_capability_used: false,
  }, null, 2));

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(report));
  }

  if (report.summary.hard_violations > 0 || report.summary.drills_passed !== report.summary.drills_total) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error("Practice camp failed:", error?.message || String(error));
    process.exitCode = 1;
  });
}
