import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {buildPracticeScorecard} from "./edge-practice-scorecard.mjs";

const dir=fs.mkdtempSync(path.join(os.tmpdir(),"daytrade-practice-scorecard-"));

fs.writeFileSync(path.join(dir,"a.json"),JSON.stringify({
  schema:"evercraft.daytrade.prospective-spread-rule-practice-summary.v1",
  generated_at:"2026-10-06T16:00:00.000Z",
  simulation_only:true,
  capital_at_risk_usd:0,
  aggregate:{
    governed_total_pnl_usd:0.002,
    always_cross_total_pnl_usd:-0.001,
    rule_improvement_vs_always_cross_usd:0.003
  },
  live_trade_authority:false
}));
fs.writeFileSync(path.join(dir,"b.json"),JSON.stringify({
  schema:"evercraft.daytrade.prospective-spread-rule-practice-summary.v1",
  generated_at:"2026-10-06T16:01:00.000Z",
  simulation_only:true,
  capital_at_risk_usd:0,
  aggregate:{
    governed_total_pnl_usd:-0.004,
    always_cross_total_pnl_usd:-0.002,
    rule_improvement_vs_always_cross_usd:-0.002
  },
  live_trade_authority:false
}));
fs.writeFileSync(path.join(dir,"c.json"),JSON.stringify({
  schema:"evercraft.daytrade.spread-persistence-practice-summary.v1",
  generated_at:"2026-10-06T16:02:00.000Z",
  simulation_only:true,
  capital_at_risk_usd:0,
  live_trade_authority:false
}));

const score=buildPracticeScorecard({receiptDir:dir});
assert.equal(score.receipt_count,3);
assert.equal(score.invalid_receipt_count,0);
assert.equal(score.simulation_receipt_count,3);
assert.equal(score.total_reported_capital_at_risk_usd,0);
assert.equal(score.any_live_trade_authority,false);
assert.equal(score.prospective_spread_rule.windows,2);
assert.equal(score.prospective_spread_rule.helped_windows,1);
assert.equal(score.prospective_spread_rule.hurt_windows,1);
assert.equal(score.prospective_spread_rule.neutral_windows,0);
assert.ok(
  Math.abs(
    score.prospective_spread_rule.cumulative_rule_improvement_vs_always_cross_usd-
    0.001
  )<1e-12
);
assert.equal(
  score.prospective_spread_rule.evidence_state,
  "PRACTICE_SAMPLE_TOO_SMALL"
);
assert.equal(score.spread_persistence_receipts,1);
assert.equal(score.live_trade_authority,false);

console.log(JSON.stringify({
  ok:true,
  helped_and_hurt_windows_both_preserved:true,
  scorecard_does_not_hide_negative_practice:true,
  no_live_authority:true
}));
