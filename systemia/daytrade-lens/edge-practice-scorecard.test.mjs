import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {buildPracticeScorecard} from "./edge-practice-scorecard.mjs";

const dir=fs.mkdtempSync(path.join(os.tmpdir(),"daytrade-practice-scorecard-"));

function write(name,generated_at,aggregate,schema="evercraft.daytrade.prospective-spread-rule-practice-summary.v1"){
  fs.writeFileSync(path.join(dir,name),JSON.stringify({
    schema,
    generated_at,
    simulation_only:true,
    capital_at_risk_usd:0,
    aggregate,
    live_trade_authority:false
  }));
}

write("a.json","2026-10-06T16:00:00.000Z",{
  governed_total_pnl_usd:0.002,
  always_cross_total_pnl_usd:-0.001,
  rule_improvement_vs_always_cross_usd:0.003
});
write("near.json","2026-10-06T16:01:00.000Z",{
  governed_total_pnl_usd:0,
  always_cross_total_pnl_usd:0,
  rule_improvement_vs_always_cross_usd:0
});
write("b.json","2026-10-06T16:06:00.000Z",{
  governed_total_pnl_usd:-0.004,
  always_cross_total_pnl_usd:-0.002,
  rule_improvement_vs_always_cross_usd:-0.002
});
write(
  "c.json",
  "2026-10-06T16:02:00.000Z",
  {},
  "evercraft.daytrade.spread-persistence-practice-summary.v1"
);

const score=buildPracticeScorecard({receiptDir:dir});
assert.equal(score.receipt_count,4);
assert.equal(score.invalid_receipt_count,0);
assert.equal(score.simulation_receipt_count,4);
assert.equal(score.total_reported_capital_at_risk_usd,0);
assert.equal(score.any_live_trade_authority,false);
assert.equal(score.prospective_spread_rule.raw_windows,3);
assert.equal(score.prospective_spread_rule.windows,2);
assert.equal(score.prospective_spread_rule.near_duplicate_windows_excluded,1);
assert.equal(score.prospective_spread_rule.minimum_independence_separation_ms,300000);
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
assert.equal(score.controls.raw_runs_remain_visible,true);
assert.equal(score.controls.near_duplicate_windows_excluded_from_evidence,true);
assert.equal(score.live_trade_authority,false);

console.log(JSON.stringify({
  ok:true,
  helped_and_hurt_independent_windows_preserved:true,
  near_duplicate_window_preserved_but_not_counted:true,
  scorecard_does_not_hide_negative_practice:true,
  no_live_authority:true
}));
