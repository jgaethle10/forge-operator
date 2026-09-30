import assert from "node:assert/strict";
import { DEFAULT_RISK, riskGate, runAdversarialDrills, buildReplayCandidates, selectDailyPracticeTrades } from "./practice-camp.mjs";

const drills = runAdversarialDrills(DEFAULT_RISK);
assert.equal(drills.every((d) => d.passed), true);

assert.equal(riskGate({
  data_source: "MOCK",
  source_age_seconds: 0,
  stale_after_seconds: 15,
  reward_risk_ratio: 2,
  planned_risk_dollars: 0.05,
  trades_today: 0,
  open_position: false,
}).pass, false);

const bars = [];
const start = Date.parse("2026-09-14T13:30:00Z");
for (let i = 0; i < 30; i++) {
  const base = i < 6 ? 100 + (i % 2) * 0.10 : 100.30 + (i - 6) * 0.01;
  bars.push({
    t: new Date(start + i * 5 * 60_000).toISOString(),
    o: base - 0.03,
    h: base + 0.08,
    l: base - 0.08,
    c: base,
    v: 1000 + i * 10,
  });
}
const candidates = buildReplayCandidates("TEST", bars, DEFAULT_RISK);
assert.ok(candidates.length >= 1);
assert.equal(candidates[0].execution, "SIMULATION_ONLY");
assert.ok(candidates[0].planned_risk_dollars <= DEFAULT_RISK.max_risk_per_trade + 1e-9);

const sessions = selectDailyPracticeTrades(candidates, DEFAULT_RISK);
assert.equal(sessions.length, 1);
assert.equal(sessions[0].hard_violations, 0);

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.daytrade-practice-camp-proof.v1",
  adversarial_drills: drills.length,
  all_drills_passed: true,
  historical_replay_engine: true,
  live_order_capability_used: false,
}));
